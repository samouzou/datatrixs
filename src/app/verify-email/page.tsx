'use client';

import * as React from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Mail, RefreshCw, LogOut, CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth, useUser } from "@/firebase"
import { sendEmailVerification } from "firebase/auth"
import { useToast } from "@/hooks/use-toast"

export default function VerifyEmailPage() {
  const { user, isUserLoading } = useUser()
  const auth = useAuth()
  const router = useRouter()
  const { toast } = useToast()
  const [isResending, setIsResending] = React.useState(false)
  const [isChecking, setIsChecking] = React.useState(false)

  React.useEffect(() => {
    if (!isUserLoading && !user) {
      router.push("/login")
    }
    if (user?.emailVerified) {
      router.push("/dashboard")
    }
  }, [user, isUserLoading, router])

  const handleResendEmail = async () => {
    if (!user) return;
    setIsResending(true);
    try {
      await sendEmailVerification(user);
      toast({
        title: "Verification Sent",
        description: "A new verification link has been sent to your email address.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to resend verification email.",
      });
    } finally {
      setIsResending(false);
    }
  };

  const handleCheckStatus = async () => {
    if (!user) return;
    setIsChecking(true);
    try {
      // Reload user to get latest emailVerified status
      await user.reload();
      if (user.emailVerified) {
        toast({
          title: "Email Verified",
          description: "Thank you! Redirecting to your dashboard...",
        });
        router.push("/dashboard");
      } else {
        toast({
          title: "Still Pending",
          description: "We haven't detected the verification yet. Please check your inbox and click the link.",
        });
      }
    } catch (error: any) {
      console.error(error);
    } finally {
      setIsChecking(false);
    }
  };

  const handleSignOut = async () => {
    await auth.signOut();
    router.push("/login");
  };

  if (isUserLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-white/5 bg-card/50 backdrop-blur-sm shadow-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-6 flex justify-center">
            <Image 
              src="/dx-logo.svg" 
              alt="Datatrixs Logo" 
              width={180} 
              height={50} 
              priority 
              className="object-contain"
            />
          </div>
          <div className="mx-auto mb-4 bg-primary/10 p-3 rounded-full w-fit">
            <Mail className="size-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold font-headline">Verify your email</CardTitle>
          <CardDescription className="pt-2">
            We've sent a verification link to <span className="font-bold text-foreground">{user?.email}</span>. 
            Please check your inbox to activate your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-lg bg-muted/50 border border-border space-y-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="size-4 text-accent mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Check your spam folder if you don't see the email within 2 minutes.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="size-4 text-accent mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Click the link in the email to confirm your identity.
              </p>
            </div>
          </div>

          <Button 
            className="w-full bg-primary hover:bg-primary/90" 
            onClick={handleCheckStatus}
            disabled={isChecking}
          >
            {isChecking ? <Loader2 className="size-4 animate-spin mr-2" /> : <RefreshCw className="size-4 mr-2" />}
            I've verified my email
          </Button>
          
          <Button 
            variant="outline" 
            className="w-full border-white/10 hover:bg-white/5" 
            onClick={handleResendEmail}
            disabled={isResending}
          >
            {isResending ? <Loader2 className="size-4 animate-spin mr-2" /> : "Resend Verification Email"}
          </Button>
        </CardContent>
        <CardFooter className="flex justify-center border-t border-white/5 pt-6 mt-2">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={handleSignOut}>
            <LogOut className="size-4 mr-2" /> Sign Out
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
