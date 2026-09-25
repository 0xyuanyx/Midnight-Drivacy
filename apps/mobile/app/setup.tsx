import { useRouter } from "expo-router";
import { SetupFlow } from "@/components/setup/SetupFlow";
import { previewSetupServices } from "@/components/setup/services";
import { useAppState } from "@/state/app-provider";

export default function Setup() {
  const router = useRouter();
  const { dispatch } = useAppState();
  return (
    <SetupFlow
      services={previewSetupServices}
      onBack={() => router.replace("/onboarding")}
      onComplete={() => {
        dispatch({ type: "COMPLETE_SETUP_PREVIEW" });
        router.replace("/consent");
      }}
    />
  );
}
