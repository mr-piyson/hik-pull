import { ArrowLeft, ShieldAlert } from "lucide-react";
import { AuthLayout } from "@/components/auth-layout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";

export default function AuthErrorPage() {
  return (
    <AuthLayout
      title="Authentication issue"
      description="The sign-in attempt could not be completed."
    >
      <div className="flex flex-col gap-4">
        <Alert variant="destructive">
          <ShieldAlert aria-hidden="true" />
          <AlertTitle>Authentication error occurred</AlertTitle>
          <AlertDescription>
            Your session could not be verified. Please try signing in again.
          </AlertDescription>
        </Alert>
        <ButtonLink href="/sign-in" className="h-9 w-full">
          <ArrowLeft data-icon="inline-start" aria-hidden="true" />
          Back to sign in
        </ButtonLink>
      </div>
    </AuthLayout>
  );
}
