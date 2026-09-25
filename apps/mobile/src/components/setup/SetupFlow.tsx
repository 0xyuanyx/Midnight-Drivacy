import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  AppState,
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppScreen } from "@/components/AppScreen";
import { CompletionMark } from "@/components/CompletionMark";
import { ScreenHeader } from "@/components/ScreenHeader";
import { PrimaryButton } from "@/components/PrimaryButton";
import { colors } from "@/theme/tokens";
import { typography } from "@/theme/typography";
import {
  type SetupServices,
  type WalletHandle,
  type WalletConnection,
} from "./services";

type Step =
  | "email"
  | "code"
  | "profile"
  | "intro"
  | "password"
  | "connecting"
  | "complete";
const headings: Record<Step, string> = {
  email: "이메일 인증",
  code: "이메일 인증",
  profile: "가입 정보",
  intro: "월렛 준비",
  password: "월렛 만들기",
  connecting: "월렛 연결",
  complete: "준비 완료",
};

function Field({
  label,
  helper,
  helperTone = "neutral",
  inputRef,
  ...props
}: React.ComponentProps<typeof TextInput> & {
  label: string;
  helper?: string;
  helperTone?: "neutral" | "error" | "success";
  inputRef?: React.Ref<TextInput>;
}) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        ref={inputRef}
        accessibilityLabel={label}
        placeholderTextColor="#8C919C"
        autoCapitalize="none"
        autoCorrect={false}
        {...props}
        style={[s.input, props.style]}
      />
      {helper && (
        <Text
          accessibilityRole={helperTone === "error" ? "alert" : undefined}
          accessibilityLiveRegion="polite"
          style={[
            s.helper,
            helperTone === "error" && { color: "#BC344B" },
            helperTone === "success" && { color: colors.success },
          ]}
        >
          {helper}
        </Text>
      )}
    </View>
  );
}

function Card({
  title,
  body,
  tone = "white",
}: {
  title: string;
  body: string;
  tone?: "white" | "blue" | "yellow" | "green";
}) {
  return (
    <View
      style={[
        s.card,
        tone === "blue" && s.blue,
        tone === "yellow" && s.yellow,
        tone === "green" && s.green,
      ]}
    >
      <Text style={s.cardTitle}>{title}</Text>
      <Text style={s.cardBody}>{body}</Text>
    </View>
  );
}

function Check({
  checked,
  onPress,
  label,
  children,
}: {
  checked: boolean;
  onPress(): void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      onPress={onPress}
      style={s.checkRow}
    >
      <View style={[s.check, checked && s.checked]}>
        <Text style={s.tick}>{checked ? "✓" : ""}</Text>
      </View>
      <Text style={s.checkText}>{children}</Text>
    </Pressable>
  );
}

function Spinner() {
  const spin = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(true);
  const [foreground, setForeground] = useState(
    AppState.currentState == null || AppState.currentState === "active",
  );
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReduceMotion(value);
    });
    const motion = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    const lifecycle = AppState.addEventListener("change", (value) =>
      setForeground(value === "active"),
    );
    return () => {
      mounted = false;
      motion.remove();
      lifecycle.remove();
    };
  }, []);
  useEffect(() => {
    if (reduceMotion || !foreground) return;
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 2200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin, reduceMotion, foreground]);
  return (
    <View
      accessibilityLabel="월렛 연결 확인 중"
      accessibilityRole="progressbar"
      style={s.ringArea}
    >
      <Animated.View
        style={[
          s.ring,
          {
            transform: [
              {
                rotate: spin.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0deg", "360deg"],
                }),
              },
            ],
          },
        ]}
      >
        <View style={s.ringDot} />
      </Animated.View>
      <Text style={s.dots}>···</Text>
    </View>
  );
}

function validBirth(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 8) return false;
  const y = Number(digits.slice(0, 4)),
    m = Number(digits.slice(4, 6)),
    d = Number(digits.slice(6));
  const date = new Date(y, m - 1, d);
  return (
    y >= 1900 &&
    date <= new Date() &&
    date.getFullYear() === y &&
    date.getMonth() === m - 1 &&
    date.getDate() === d
  );
}

export function SetupFlow({
  services,
  onBack,
  onComplete,
}: {
  services: SetupServices;
  onBack(): void;
  onComplete(): void;
}) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [emailInvalid, setEmailInvalid] = useState(false);
  const [nameInvalid, setNameInvalid] = useState(false);
  const [birthInvalid, setBirthInvalid] = useState(false);
  const [phoneInvalid, setPhoneInvalid] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [birth, setBirth] = useState("");
  const [phone, setPhone] = useState("");
  const [profileConsent, setProfileConsent] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentAt, setSentAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [connection, setConnection] = useState<WalletConnection>({
    connected: false,
  });
  const wallet = useRef<WalletHandle | null>(null);
  const operation = useRef(0);
  const inFlight = useRef(false);
  const finished = useRef(false);
  const otp = useRef<TextInput>(null);
  const birthInput = useRef<TextInput>(null);
  const phoneInput = useRef<TextInput>(null);
  const confirmationInput = useRef<TextInput>(null);
  useEffect(
    () => () => {
      operation.current += 1;
    },
    [],
  );
  useEffect(() => {
    if (step !== "code") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [step]);
  const resendIn = Math.max(0, 60 - Math.floor((now - sentAt) / 1000));
  const resendLabel = `${String(Math.floor(resendIn / 60)).padStart(2, "0")}:${String(resendIn % 60).padStart(2, "0")}`;
  const codeExpired = sentAt > 0 && now - sentAt > 300000;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const passwordValid =
    password.length >= 12 &&
    password.length <= 128 &&
    !/^\s+$/.test(password) &&
    password !== email.trim();
  const passwordsMatch = confirmation.length > 0 && password === confirmation;
  const profileValid =
    !!name.trim() &&
    validBirth(birth) &&
    /^01[016789]\d{7,8}$/.test(phone.replace(/\D/g, "")) &&
    profileConsent;
  const canContinue =
    step === "email"
      ? emailValid
      : step === "code"
        ? code.length === 6 && !codeExpired
        : step === "profile"
          ? profileValid
          : step === "password"
            ? passwordValid && passwordsMatch && acknowledged
            : true;

  function go(next: Step) {
    Keyboard.dismiss();
    setError("");
    setStep(next);
  }
  function back() {
    if (step === "complete" || (step === "connecting" && inFlight.current)) return;
    Keyboard.dismiss();
    operation.current += 1;
    inFlight.current = false;
    setBusy(false);
    setError("");
    setPassword("");
    setConfirmation("");
    if (step === "email") {
      onBack();
      return;
    }
    // Once a wallet exists, never return to creation or silently create a second one.
    if (step === "connecting") {
      go("intro");
      return;
    }
    go(
      (
        {
          code: "email",
          profile: "code",
          intro: "profile",
          password: "intro",
        } as const
      )[step],
    );
  }
  async function run(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    const id = ++operation.current;
    try {
      await action();
    } catch (cause) {
      if (id === operation.current)
        setError(
          cause instanceof Error ? cause.message : "잠시 후 다시 시도해주세요.",
        );
    } finally {
      if (id === operation.current) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }
  async function sendCode() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setEmailInvalid(true);
      return;
    }
    await run(async () => {
      const id = operation.current;
      await services.sendCode(email.trim());
      if (id !== operation.current) return;
      setCode("");
      setSentAt(Date.now());
      setNow(Date.now());
      go("code");
    });
  }
  async function verify() {
    if (code.length !== 6) {
      setError("6자리 인증번호를 입력해주세요.");
      return;
    }
    if (Date.now() - sentAt > 300000) {
      setError("인증번호가 만료됐어요. 다시 받아주세요.");
      return;
    }
    await run(async () => {
      const id = operation.current;
      await services.verifyCode(email.trim(), code);
      if (id === operation.current) {
        setCode("");
        go("profile");
      }
    });
  }
  function profile() {
    if (
      !name.trim() ||
      !validBirth(birth) ||
      !/^01[016789]\d{7,8}$/.test(phone.replace(/\D/g, ""))
    ) {
      setError("이름, 생년월일과 휴대전화 번호를 확인해주세요.");
      return;
    }
    if (!profileConsent) {
      setError("가입 정보 처리 안내를 확인해주세요.");
      return;
    }
    go("intro");
  }
  async function connect() {
    await run(async () => {
      const id = operation.current;
      go("connecting");
      if (!wallet.current) {
        const created = await services.createWallet(password);
        // Retain the created handle even if navigation changed; retry must not duplicate it.
        wallet.current = created;
        setPassword("");
        setConfirmation("");
      }
      if (id !== operation.current) return;
      const result = await services.connectWallet(wallet.current);
      if (id !== operation.current) return;
      if (!services.preview && !result.connected)
        throw new Error("네트워크 연결을 확인한 후 다시 시도해주세요.");
      setConnection(result);
      go("complete");
    });
  }
  function create() {
    if (
      password.length < 12 ||
      password.length > 128 ||
      /^\s+$/.test(password) ||
      password === email.trim()
    ) {
      setError("이메일과 다른 12자 이상의 암호를 입력해주세요.");
      return;
    }
    if (password !== confirmation) {
      setError("월렛 암호가 일치하지 않아요.");
      return;
    }
    if (!acknowledged) {
      setError("기기 분실 안내를 확인해주세요.");
      return;
    }
    void connect();
  }
  const action =
    step === "email"
      ? sendCode
      : step === "code"
        ? verify
        : step === "profile"
          ? profile
          : step === "intro"
            ? () => wallet.current ? void connect() : go("password")
            : step === "password"
              ? create
              : step === "connecting"
                ? connect
                : () => {
                    if (!finished.current) {
                      finished.current = true;
                      onComplete();
                    }
                  };
  const cta = {
    email: "인증코드 받기",
    code: "코드 확인하기",
    profile: "입력하고 계속하기",
    intro: wallet.current ? "준비한 월렛 연결하기" : "확인하고 월렛 만들기",
    password: "월렛 만들고 연결하기",
    connecting: wallet.current ? "다시 연결하기" : "다시 시도하기",
    complete: "DriVacy 시작하기",
  }[step];

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <AppScreen
        key={step}
        contentContainerStyle={s.screen}
        fixedFooter={
          step === "connecting" && !error ? undefined : (
            <View style={s.footer}>
              {step === "profile" && (
                <Check label="가입 정보 처리 안내 확인" checked={profileConsent} onPress={() => setProfileConsent(v => !v)}>
                  가입 정보 처리 안내를 확인했어요.
                </Check>
              )}
              {step === "password" && (
                <Check label="기기 분실 안내 확인" checked={acknowledged} onPress={() => setAcknowledged(v => !v)}>
                  기기를 잃으면 현재 버전에서 월렛을 복구할 수 없다는 점을 확인했어요.
                </Check>
              )}
              {!!error && !["email", "code"].includes(step) && (
                <Text accessibilityRole="alert" style={s.error}>
                  {error}
                </Text>
              )}
              {step === "code" && (
                <Pressable
                  accessibilityRole="button"
                  onPress={back}
                  style={s.changeEmail}
                >
                  <Text style={s.helper}>이메일 변경</Text>
                </Pressable>
              )}
              <PrimaryButton
                title={busy ? "처리 중…" : cta}
                disabled={busy || !canContinue}
                onPress={() => {
                  void action();
                }}
              />
            </View>
          )
        }
      >
        <ScreenHeader
          title={headings[step]}
          onBack={back}
          showBack={step !== "complete"}
          backDisabled={step === "connecting" && busy}
        />
        <View style={s.hero}>
          {["intro", "password", "connecting", "complete"].includes(step) && (
            <Text style={s.eyebrow}>
              {step === "intro"
                ? "1 / 3 · 월렛 알아보기"
                : step === "password"
                  ? "2 / 3 · 월렛 생성"
                  : step === "connecting"
                    ? "3 / 3 · 연결 확인"
                    : "3 / 3 · 연결 준비"}
            </Text>
          )}
          {["email", "code", "profile"].includes(step) && (
            <View style={{ height: 24 }} />
          )}
          {step === "email" && (
            <>
              <Text style={s.title}>이메일로{"\n"}간편하게 시작해요</Text>
              <Text style={s.description}>
                로그인과 월렛 연결에 사용할 이메일이에요.
              </Text>
            </>
          )}
          {step === "code" && (
            <>
              <Text style={s.title}>6자리 코드를{"\n"}입력해주세요.</Text>
              <Text style={s.description}>
                {email.trim()}으로{" "}
                {services.preview ? "인증을 준비해요." : "보낸 코드예요."}
              </Text>
            </>
          )}
          {step === "profile" && (
            <>
              <Text style={s.title}>기본 정보를 알려주세요.</Text>
              <Text style={s.description}>
                {services.preview
                  ? "서비스 이용에 필요한 정보를 입력해주세요."
                  : "이메일 확인은 끝났어요.\n서비스 이용에 필요한 정보를 입력해주세요."}
              </Text>
            </>
          )}
          {step === "intro" && (
            <>
              <Text style={s.title}>월렛 개인키는{"\n"}내 기기에 보관해요</Text>
              <Text style={s.description}>
                월렛은 중요한 요청을 직접 승인하고,{"\n"}내 정보의 사용을
                확인하는 공간이에요.
              </Text>
            </>
          )}
          {step === "password" && (
            <>
              <Text style={s.title}>월렛 잠금 암호를 정해주세요</Text>
              <Text style={s.description}>
                이 기기에서 월렛을 다시 열 때 사용할 암호예요.{"\n"}서버로
                전송되지 않아요.
              </Text>
            </>
          )}
          {step === "connecting" && (
            <>
              <Text style={s.title}>{error ? "월렛 연결을 확인해주세요" : "월렛을 연결하고 있어요"}</Text>
              <Text style={s.description}>
                이 기기의 월렛과 네트워크 상태를 확인해요.{"\n"}완료되기 전에는
                거래를 시작하지 않아요.
              </Text>
            </>
          )}
        </View>
        {step === "email" && (
          <View style={s.form}>
            <Field
              label="이메일"
              value={email}
              editable={!busy}
              onChangeText={(value) => {
                setEmail(value);
                setEmailInvalid(false);
                setError("");
              }}
              onBlur={() => setEmailInvalid(!emailValid)}
              onSubmitEditing={() => { if (emailValid) void sendCode(); }}
              returnKeyType="done"
              keyboardType="email-address"
              autoComplete="email"
              placeholder="driver@example.com"
              helper={
                emailInvalid
                  ? "올바른 이메일 주소를 입력해주세요."
                  : error ||
                    (services.preview
                      ? "이메일 발송 연결 전 · 입력한 정보는 저장하지 않아요."
                      : "입력한 이메일로 6자리 인증코드를 보내드려요.")
              }
              helperTone={emailInvalid || error ? "error" : "neutral"}
            />
          </View>
        )}
        {step === "code" && (
          <View style={s.form}>
            <Pressable onPress={() => otp.current?.focus()} style={s.otpWrap}>
              <View pointerEvents="none" style={s.otpCells}>
                {Array.from({ length: 6 }, (_, i) => (
                  <View
                    key={i}
                    style={[s.otpCell, i === code.length && s.otpActive]}
                  >
                    <Text style={s.otpDigit}>{code[i] ?? ""}</Text>
                  </View>
                ))}
              </View>
              <TextInput
                ref={otp}
                autoFocus
                accessibilityLabel="6자리 인증번호"
                value={code}
                editable={!busy}
                onChangeText={(v) => {
                  setCode(v.replace(/\D/g, "").slice(0, 6));
                  setError("");
                }}
                onSubmitEditing={() => { if (canContinue) void verify(); }}
                returnKeyType="done"
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={6}
                style={s.otpInput}
                caretHidden
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy || resendIn > 0}
              onPress={() => {
                void sendCode();
              }}
              style={s.resend}
            >
              <Text style={s.helper}>
                코드가 오지 않았나요?{" "}
                {resendIn > 0 ? `${resendLabel} 후 다시 보내기` : "다시 보내기"}
              </Text>
            </Pressable>
            {services.preview && (
              <Text style={s.helper}>
                이메일 발송 연결 전 · 화면 확인용 코드 123456
              </Text>
            )}
            {(error || codeExpired) && (
              <Text accessibilityRole="alert" style={s.error}>
                {error || "인증번호가 만료됐어요. 다시 받아주세요."}
              </Text>
            )}
          </View>
        )}
        {step === "profile" && (
          <View style={s.profileForm}>
            <Field
              label="이름"
              value={name}
              onChangeText={value => { setName(value); setNameInvalid(false); }}
              onBlur={() => setNameInvalid(!name.trim())}
              onSubmitEditing={() => birthInput.current?.focus()}
              returnKeyType="next"
              helper={nameInvalid ? "이름을 입력해주세요." : undefined}
              helperTone={nameInvalid ? "error" : "neutral"}
              placeholder="홍길동"
              maxLength={60}
              autoComplete="name"
            />
            <Field
              inputRef={birthInput}
              label="생년월일"
              value={birth}
              onChangeText={(value) => {
                setBirthInvalid(false);
                const digits = value.replace(/\D/g, "").slice(0, 8);
                setBirth(
                  [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8)]
                    .filter(Boolean)
                    .join("/"),
                );
              }}
              onBlur={() => setBirthInvalid(!validBirth(birth))}
              onSubmitEditing={() => phoneInput.current?.focus()}
              returnKeyType="next"
              placeholder="1990/01/01"
              keyboardType="number-pad"
              maxLength={10}
              helper={birthInvalid ? "생년월일을 확인해주세요." : "8자리 날짜 형식"}
              helperTone={birthInvalid ? "error" : "neutral"}
            />
            <Field
              inputRef={phoneInput}
              label="휴대전화 번호"
              value={phone}
              onChangeText={(value) => {
                setPhoneInvalid(false);
                const digits = value.replace(/\D/g, "").slice(0, 11);
                const split = digits.length === 10 ? 6 : 7;
                setPhone(
                  [
                    digits.slice(0, 3),
                    digits.slice(3, split),
                    digits.slice(split),
                  ]
                    .filter(Boolean)
                    .join("-"),
                );
              }}
              onBlur={() => setPhoneInvalid(!/^01[016789]\d{7,8}$/.test(phone.replace(/\D/g, "")))}
              onSubmitEditing={() => Keyboard.dismiss()}
              returnKeyType="done"
              placeholder="010-1234-5678"
              keyboardType="phone-pad"
              maxLength={13}
              helper={phoneInvalid ? "휴대전화 번호를 확인해주세요." : "문자 인증은 진행하지 않아요."}
              helperTone={phoneInvalid ? "error" : "neutral"}
            />
            <View style={[s.card, s.blue, s.notice]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="가입 정보 처리 안내 상세"
                onPress={() => setShowPrivacy((v) => !v)}
              >
                <Text style={s.cardTitle}>
                  입력 정보 안내 {showPrivacy ? "⌃" : "›"}
                </Text>
                <Text style={s.cardBody}>
                  이 단계에서는 실제 보험계약 조회나{"\n"}본인확인을 진행하지
                  않아요.
                </Text>
              </Pressable>
              {showPrivacy && (
                <Text style={s.cardBody}>
                  이름·생년월일·휴대전화 번호는 가입 정보 입력 화면 확인에만
                  사용하며, 현재 서버 전송·저장하지 않습니다. 실제 서비스의 수집
                  목적과 보유 기간은 서비스 연결 전에 확정해야 합니다.
                </Text>
              )}
            </View>
          </View>
        )}
        {step === "intro" && (
          <View style={s.cards}>
            <Card
              tone="blue"
              title="내 기기에 안전하게"
              body={
                "월렛 키는 이 기기 안에서 암호화돼요.\n서비스 서버에 개인키를 보내지 않아요."
              }
            />
            <Card
              title="로그인과 승인은 따로"
              body={
                "이메일로 로그인해도 거래가 바로 승인되지는 않아요.\n요청 내용을 본 뒤 월렛에서 다시 확인해요."
              }
            />
            <Card
              tone="yellow"
              title="기기 분실 전 확인"
              body={"현재 버전에서는 다른 기기로 월렛을\n복구할 수 없어요."}
            />
          </View>
        )}
        {step === "password" && (
          <View style={s.form}>
            <Field
              label="월렛 암호"
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={() => confirmationInput.current?.focus()}
              returnKeyType="next"
              secureTextEntry
              maxLength={128}
              placeholder="암호 입력"
              helper={
                passwordValid
                  ? "조건을 충족합니다"
                  : "12자 이상 · 이메일 주소와 다른 암호"
              }
              helperTone={passwordValid ? "success" : "neutral"}
            />
            <Field
              inputRef={confirmationInput}
              label="월렛 암호 확인"
              value={confirmation}
              onChangeText={setConfirmation}
              onSubmitEditing={() => Keyboard.dismiss()}
              returnKeyType="done"
              secureTextEntry
              maxLength={128}
              placeholder="암호 다시 입력"
              helper={
                passwordsMatch
                  ? "일치합니다"
                  : confirmation
                    ? "암호가 일치하지 않아요."
                    : "같은 암호를 한 번 더 입력해주세요."
              }
              helperTone={
                passwordsMatch ? "success" : confirmation ? "error" : "neutral"
              }
            />
          </View>
        )}
        {step === "connecting" && (
          <>
            {!error && <Spinner />}
            <View style={s.connectionCards}>
              <Card
                tone={wallet.current && !services.preview ? "green" : "blue"}
                title={
                  services.preview
                    ? "기기 월렛 연결 준비"
                    : wallet.current
                      ? "기기 월렛 준비됨"
                      : "기기 월렛 준비 중"
                }
                body={
                  services.preview
                    ? "실제 월렛 생성 서비스는 연결 전이에요."
                    : "기기 월렛을 확인하고 있어요."
                }
              />
              <Card
                tone="blue"
                title={error ? "연결 확인 필요" : "네트워크 확인 중"}
                body="같은 월렛으로 연결을 이어가요."
              />
            </View>
          </>
        )}
        {step === "complete" && (
          <View style={s.complete}>
            <CompletionMark />
            <Text style={[s.title, s.center]}>
              {connection.connected
                ? "월렛 연결이\n완료됐어요"
                : "월렛 연결 준비가\n완료됐어요"}
            </Text>
            <Text style={[s.description, s.center]}>
              {connection.connected
                ? "이 계정으로 로그인한 현재 기기에서\n월렛을 사용할 수 있어요."
                : "서비스 연결 전이에요.\n보험조회 화면을 먼저 확인할 수 있어요."}
            </Text>
            <View style={s.completeCard}>
              <Card
                title={connection.connected ? "연결된 월렛" : "서비스 연결 전"}
                body={
                  connection.connected
                    ? `${connection.address ?? "주소 확인 필요"}\n네트워크 연결 확인`
                    : "실제 월렛과 네트워크는 아직 연결되지 않았어요."
                }
              />
            </View>
          </View>
        )}
      </AppScreen>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  footer: { backgroundColor: colors.background, gap: 8 },
  screen: {
    paddingTop: 18,
    paddingHorizontal: 20,
  },
  hero: { marginTop: 24 },
  title: { ...typography.title, color: colors.textPrimary },
  description: { ...typography.body, color: "#66666D", marginTop: 8 },
  eyebrow: { ...typography.eyebrow, color: colors.primary, marginBottom: 8 },
  form: { marginTop: 34 },
  profileForm: { marginTop: 30 },
  field: { marginBottom: 20 },
  label: { ...typography.label, color: "#343A47", marginBottom: 8 },
  input: {
    ...typography.caption,
    height: 52,
    paddingHorizontal: 14,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#DEE3ED",
    borderRadius: 11,
    color: colors.textPrimary,
  },
  helper: { ...typography.caption, color: "#8C919C", marginTop: 8 },
  card: { padding: 16, borderRadius: 16, backgroundColor: "#FFF" },
  cardTitle: { ...typography.label, color: "#292E37" },
  cardBody: { ...typography.caption, color: "#85858C", marginTop: 6 },
  blue: { backgroundColor: "#EEF6FF" },
  yellow: { backgroundColor: "#FFFAEC" },
  green: { backgroundColor: "#EDFAF3" },
  cards: { marginTop: 28, gap: 12 },
  notice: { borderWidth: 1, borderColor: "#D4E0F2", padding: 16, marginTop: 0 },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    gap: 10,
  },
  check: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#C6CBD4",
    alignItems: "center",
    justifyContent: "center",
  },
  checked: { backgroundColor: colors.primary, borderColor: colors.primary },
  tick: { color: "#FFF", fontSize: 14 },
  checkText: { ...typography.caption, color: "#667080", flex: 1 },
  otpWrap: { height: 54, position: "relative" },
  otpCells: { flexDirection: "row", gap: 8, height: 54 },
  otpCell: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#B9CDE8",
    backgroundColor: "#FFF",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  otpActive: { borderColor: colors.primary },
  otpDigit: { ...typography.cardTitle, color: colors.primary },
  otpInput: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    opacity: 0.02,
    color: "transparent",
  },
  resend: { minHeight: 36, justifyContent: "center" },
  changeEmail: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  ringArea: { height: 228, alignItems: "center", justifyContent: "center" },
  ring: {
    width: 154,
    height: 154,
    borderRadius: 77,
    borderWidth: 7,
    borderColor: "#B9CEF3",
    alignItems: "center",
  },
  ringDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    top: -11,
  },
  dots: {
    position: "absolute",
    color: colors.primary,
    fontSize: 30,
    letterSpacing: 5,
  },
  connectionCards: { gap: 14, marginTop: 14 },
  complete: { paddingTop: 28 },
  center: { textAlign: "center" },
  completeCard: { marginTop: 48 },
  error: {
    ...typography.caption,
    color: "#BC344B",
    marginTop: 16,
    marginBottom: 12,
  },
});
