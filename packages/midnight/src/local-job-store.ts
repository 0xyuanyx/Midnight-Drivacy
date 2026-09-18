// 로컬 개발용 저장소. B의 분산 DB claim/lease나 가입자 월렛 저장소가 아니다.
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { JobBlocked, type JobJournal, type JobJournalStore } from "./trip-job.js";

export class LocalJobStore implements JobJournalStore {
  private readonly path: string;
  constructor(path: string) { this.path = resolve(path); }
  async withLock<T>(_scopeKey: string, run: () => Promise<T>): Promise<T> {
    await mkdir(dirname(this.path), { recursive: true });
    let lock;
    try { lock = await open(`${this.path}.lock`, "wx", 0o600); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new JobBlocked("STORE_BUSY");
      throw error;
    }
    try { return await run(); }
    finally { await lock.close(); await unlink(`${this.path}.lock`); }
    // 프로세스가 강제 종료되면 lock을 남긴다. 살아 있는 작업을 TTL만 보고
    // 탈취하지 않는다. 실행 프로세스 종료 확인 후 수동 복구하며 먼저 Tx를 조회한다.
  }
  private async all(): Promise<JobJournal[]> {
    try { return JSON.parse(await readFile(this.path, "utf8")) as JobJournal[]; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error; // 손상된 저장소를 빈 기록으로 처리하면 거래를 다시 제출할 수 있다.
    }
  }
  async read(operationId: string): Promise<JobJournal | undefined> {
    return (await this.all()).find(j => j.operationId === operationId);
  }
  async list(scopeKey: string): Promise<JobJournal[]> {
    return (await this.all()).filter(j => j.scopeKey === scopeKey);
  }
  async write(value: JobJournal): Promise<void> {
    const values = (await this.all()).filter(j => j.operationId !== value.operationId);
    values.push(value);
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(values), { mode: 0o600 });
      // 불완전한 JSON을 기존 결과 위에 덮지 않도록 같은 디렉터리에서 rename한다.
      await rename(temporary, this.path);
    } finally { await unlink(temporary).catch(error => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }); }
  }
}
