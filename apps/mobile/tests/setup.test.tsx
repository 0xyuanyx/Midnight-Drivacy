import { fireEvent, render, act } from "@testing-library/react-native";
import { SetupFlow } from "@/components/setup/SetupFlow";
import type { SetupServices } from "@/components/setup/services";
import {
  appReducer,
  initialAppState,
  normalizePersistedAppState,
} from "@/state/app-state";
import { initialRouteForState, redirectForRoute } from "@/state/route-policy";

function services(): SetupServices {
  return {
    preview: true,
    sendCode: jest.fn(async () => undefined),
    verifyCode: jest.fn(async (_email, code) => {
      if (code !== "123456") throw new Error("인증번호를 확인해주세요.");
    }),
    createWallet: jest.fn(async () => ({ id: "local-preview" })),
    connectWallet: jest.fn(async () => ({ connected: false })),
  };
}

async function reachWallet(ui: Awaited<ReturnType<typeof render>>) {
  await fireEvent.changeText(ui.getByLabelText("이메일"), "driver@example.com");
  await fireEvent.press(ui.getByText("인증코드 받기"));
  await fireEvent.changeText(ui.getByLabelText("6자리 인증번호"), "123456");
  await fireEvent.press(ui.getByText("코드 확인하기"));
  await fireEvent.changeText(ui.getByLabelText("이름"), "홍길동");
  await fireEvent.changeText(ui.getByLabelText("생년월일"), "19900101");
  await fireEvent.changeText(ui.getByLabelText("휴대전화 번호"), "01012345678");
  await fireEvent.press(
    ui.getByRole("checkbox", { name: "가입 정보 처리 안내 확인" }),
  );
  await fireEvent.press(ui.getByText("입력하고 계속하기"));
  await fireEvent.press(ui.getByText("확인하고 월렛 만들기"));
}

it("rejects invalid email and code without advancing", async () => {
  const api = services();
  const ui = await render(
    <SetupFlow services={api} onBack={jest.fn()} onComplete={jest.fn()} />,
  );
  await fireEvent.changeText(ui.getByLabelText("이메일"), "bad");
  expect(ui.getByRole("button", { name: "인증코드 받기" })).toBeDisabled();
  await fireEvent(ui.getByLabelText("이메일"), "blur");
  await fireEvent.press(ui.getByText("인증코드 받기"));
  expect(ui.getByRole("alert")).toBeTruthy();
  expect(api.sendCode).not.toHaveBeenCalled();
  await fireEvent.changeText(ui.getByLabelText("이메일"), "driver@example.com");
  expect(ui.queryByRole("alert")).toBeNull();
  expect(
    ui.getByText("이메일 발송 연결 전 · 입력한 정보는 저장하지 않아요."),
  ).toBeTruthy();
  expect(ui.getByRole("button", { name: "인증코드 받기" })).toBeEnabled();
  await fireEvent.press(ui.getByText("인증코드 받기"));
  expect(ui.getByRole("button", { name: "코드 확인하기" })).toBeDisabled();
  await fireEvent.changeText(ui.getByLabelText("6자리 인증번호"), "999999");
  await fireEvent.press(ui.getByText("코드 확인하기"));
  expect(ui.getByText("인증번호를 확인해주세요.")).toBeTruthy();
  expect(ui.queryByLabelText("이름")).toBeNull();
  await fireEvent.changeText(ui.getByLabelText("6자리 인증번호"), "123456");
  expect(ui.queryByText("인증번호를 확인해주세요.")).toBeNull();
  await fireEvent.press(ui.getByText("코드 확인하기"));
  expect(ui.getByLabelText("이름")).toBeTruthy();
});

it("validates wallet passwords and retries connection without creating another wallet", async () => {
  const api = services();
  (api.connectWallet as jest.Mock).mockRejectedValueOnce(
    new Error("연결을 다시 시도해주세요."),
  );
  const complete = jest.fn();
  const ui = await render(
    <SetupFlow services={api} onBack={jest.fn()} onComplete={complete} />,
  );
  await reachWallet(ui);
  expect(
    ui.getByRole("button", { name: "월렛 만들고 연결하기" }),
  ).toBeDisabled();
  await fireEvent.changeText(ui.getByLabelText("월렛 암호"), "long-password");
  expect(ui.getByText("조건을 충족합니다")).toBeTruthy();
  await fireEvent.changeText(
    ui.getByLabelText("월렛 암호 확인"),
    "different-pass",
  );
  await fireEvent.press(
    ui.getByRole("checkbox", { name: "기기 분실 안내 확인" }),
  );
  await fireEvent.press(ui.getByText("월렛 만들고 연결하기"));
  expect(api.createWallet).not.toHaveBeenCalled();
  expect(
    ui.getByRole("button", { name: "월렛 만들고 연결하기" }),
  ).toBeDisabled();
  await fireEvent.changeText(
    ui.getByLabelText("월렛 암호 확인"),
    "long-password",
  );
  expect(ui.getByText("일치합니다")).toBeTruthy();
  expect(
    ui.getByRole("button", { name: "월렛 만들고 연결하기" }),
  ).toBeEnabled();
  await fireEvent.changeText(ui.getByLabelText("월렛 암호"), "short");
  expect(ui.queryByText("조건을 충족합니다")).toBeNull();
  expect(ui.queryByText("일치합니다")).toBeNull();
  expect(
    ui.getByRole("button", { name: "월렛 만들고 연결하기" }),
  ).toBeDisabled();
  await fireEvent.changeText(ui.getByLabelText("월렛 암호"), "long-password");
  await fireEvent.press(ui.getByText("월렛 만들고 연결하기"));
  expect(ui.getByText("연결을 다시 시도해주세요.")).toBeTruthy();
  await fireEvent.press(ui.getByText("다시 연결하기"));
  expect(api.createWallet).toHaveBeenCalledTimes(1);
  expect(ui.getByText("서비스 연결 전")).toBeTruthy();
  expect(ui.getByTestId("completion-mark")).toBeTruthy();
  await fireEvent.press(ui.getByText("DriVacy 시작하기"));
  expect(complete).toHaveBeenCalledTimes(1);
});

it("ignores a late email response after going back", async () => {
  const api = services();
  let resolve!: () => void;
  api.sendCode = () =>
    new Promise<void>((done) => {
      resolve = done;
    });
  const back = jest.fn();
  const ui = await render(
    <SetupFlow services={api} onBack={back} onComplete={jest.fn()} />,
  );
  await fireEvent.changeText(ui.getByLabelText("이메일"), "driver@example.com");
  await fireEvent.press(ui.getByText("인증코드 받기"));
  await fireEvent.press(ui.getByLabelText("뒤로"));
  await act(async () => resolve());
  expect(back).toHaveBeenCalledTimes(1);
  expect(ui.queryByLabelText("6자리 인증번호")).toBeNull();
});

it("blocks duplicate sends while the request is pending", async () => {
  const api = services();
  let resolve!: () => void;
  api.sendCode = jest.fn(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  );
  const ui = await render(
    <SetupFlow services={api} onBack={jest.fn()} onComplete={jest.fn()} />,
  );
  await fireEvent.changeText(ui.getByLabelText("이메일"), "driver@example.com");
  await fireEvent.press(ui.getByText("인증코드 받기"));
  await fireEvent.press(ui.getByText("처리 중…"));
  expect(api.sendCode).toHaveBeenCalledTimes(1);
  await act(async () => resolve());
  expect(ui.getByLabelText("6자리 인증번호")).toBeTruthy();
});

it("rejects impossible birthdates and requires information acknowledgment", async () => {
  const ui = await render(
    <SetupFlow
      services={services()}
      onBack={jest.fn()}
      onComplete={jest.fn()}
    />,
  );
  await fireEvent.changeText(ui.getByLabelText("이메일"), "driver@example.com");
  await fireEvent.press(ui.getByText("인증코드 받기"));
  await fireEvent.changeText(ui.getByLabelText("6자리 인증번호"), "123456");
  await fireEvent.press(ui.getByText("코드 확인하기"));
  await fireEvent.changeText(ui.getByLabelText("이름"), "홍길동");
  await fireEvent.changeText(ui.getByLabelText("생년월일"), "19900230");
  await fireEvent.changeText(ui.getByLabelText("휴대전화 번호"), "01012345678");
  await fireEvent(ui.getByLabelText("생년월일"), "blur");
  expect(ui.getByText("생년월일을 확인해주세요.")).toBeTruthy();
  expect(ui.getByLabelText("생년월일").props.value).toBe("1990/02/30");
  expect(ui.getByLabelText("휴대전화 번호").props.value).toBe("010-1234-5678");
  await fireEvent.press(ui.getByText("입력하고 계속하기"));
  expect(ui.getByRole("button", { name: "입력하고 계속하기" })).toBeDisabled();
  await fireEvent.changeText(ui.getByLabelText("생년월일"), "19900228");
  expect(ui.queryByText("생년월일을 확인해주세요.")).toBeNull();
  await fireEvent.press(ui.getByText("입력하고 계속하기"));
  expect(ui.getByRole("button", { name: "입력하고 계속하기" })).toBeDisabled();
  await fireEvent.press(
    ui.getByRole("checkbox", { name: "가입 정보 처리 안내 확인" }),
  );
  expect(ui.getByRole("button", { name: "입력하고 계속하기" })).toBeEnabled();
});

it("expires codes and enables resend using elapsed wall clock time", async () => {
  const clock = jest.spyOn(Date, "now").mockReturnValue(1000000);
  const api = services();
  try {
    const ui = await render(
      <SetupFlow services={api} onBack={jest.fn()} onComplete={jest.fn()} />,
    );
    await fireEvent.changeText(
      ui.getByLabelText("이메일"),
      "driver@example.com",
    );
    await fireEvent.press(ui.getByText("인증코드 받기"));
    await fireEvent.changeText(ui.getByLabelText("6자리 인증번호"), "123456");
    clock.mockReturnValue(1300001);
    await fireEvent.press(ui.getByText("코드 확인하기"));
    expect(
      ui.getByText("인증번호가 만료됐어요. 다시 받아주세요."),
    ).toBeTruthy();
    expect(api.verifyCode).not.toHaveBeenCalled();
  } finally {
    clock.mockRestore();
  }
});

it("resumes at consent with only a public preview flag and resets to the landing", () => {
  const complete = appReducer(initialAppState, {
    type: "COMPLETE_SETUP_PREVIEW",
  });
  const restored = normalizePersistedAppState({
    ...complete,
    password: "secret",
    email: "private@example.com",
    birth: "19900101",
  });
  expect(restored).toEqual({ ...initialAppState, setupPreviewCompleted: true });
  expect(initialRouteForState(restored)).toBe("/consent");
  expect(redirectForRoute("/consent", initialAppState)).toBe("/onboarding");
  expect(redirectForRoute("/setup", initialAppState)).toBeNull();
  expect(
    initialRouteForState(appReducer(restored, { type: "RESET_DEMO" })),
  ).toBe("/onboarding");
});
