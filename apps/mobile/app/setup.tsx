import { useRouter } from "expo-router";
import { SetupFlow } from "@/components/setup/SetupFlow";
import { previewSetupServices } from "@/components/setup/services";
import { useAppState } from "@/state/app-provider";
import { useDriverAuthServices } from "@/auth/driver-auth";

export default function Setup() {
  const router = useRouter();
  const { dispatch } = useAppState();
  const authServices = useDriverAuthServices();
  return (
    <SetupFlow
      services={authServices ?? previewSetupServices}
      onBack={() => router.replace("/onboarding")}
      onComplete={() => {
        dispatch({ type: "COMPLETE_SETUP_PREVIEW" });
        router.replace("/consent");
      }}
    />
  );
}
