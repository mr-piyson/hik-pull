import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function AuthErrorPage() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 items-center justify-center px-4 py-12">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Authentication issue</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTitle>Authentication error occurred.</AlertTitle>
            <AlertDescription>Please try signing in again.</AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter>
          <Button render={<Link href="/sign-in" />}>Back to sign in</Button>
        </CardFooter>
      </Card>
    </main>
  );
}
