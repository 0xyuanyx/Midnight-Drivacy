export type WalletHandle = { id: string };
export type WalletConnection = { connected: boolean; address?: string };

/** Transport boundary only: preview never authenticates or creates cryptographic keys. */
export interface SetupServices {
  preview: boolean;
  completeProfile?(profile: { name: string; birthDate: string; phoneNumber: string }): Promise<void>;
  sendCode(email: string): Promise<void>;
  verifyCode(email: string, code: string): Promise<void>;
  createWallet(password: string): Promise<WalletHandle>;
  connectWallet(wallet: WalletHandle): Promise<WalletConnection>;
}

export const previewSetupServices: SetupServices = {
  preview: true,
  async sendCode() {},
  async verifyCode(_email, code) {
    if (code !== "123456") throw new Error("인증번호를 확인해주세요.");
  },
  async createWallet() {
    return { id: "preview-only" };
  },
  async connectWallet() {
    await new Promise((resolve) => setTimeout(resolve, 1600));
    return { connected: false };
  },
};
