'use client';

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Mail, Lock, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth, useUser, useFirestore } from "@/firebase"
import { initiateEmailSignIn, ensureUserProfile } from "@/firebase/non-blocking-login"
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth"

export default function LoginPage() {
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const auth = useAuth()
  const db = useFirestore()
  const { user, isUserLoading } = useUser()
  const router = useRouter()

  React.useEffect(() => {
    if (!isUserLoading && user) {
      router.push("/dashboard")
    }
  }, [user, isUserLoading, router])

  const handleEmailLogin = (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    initiateEmailSignIn(auth, email, password)
  }

  const handleGoogleLogin = async () => {
    setLoading(true)
    const provider = new GoogleAuthProvider()
    try {
      const result = await signInWithPopup(auth, provider)
      // Ensure profile exists for social login users
      const nameParts = result.user.displayName?.split(' ') || []
      const firstName = nameParts[0] || ''
      const lastName = nameParts.slice(1).join(' ') || ''
      ensureUserProfile(db, result.user, { firstName, lastName })
    } catch (error) {
      console.error("Google login failed", error)
      setLoading(false)
    }
  }

  if (isUserLoading || user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-white/5 bg-card/50 backdrop-blur-sm shadow-2xl">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-6 flex justify-center">
            <Image 
              src="/dx-logo.svg" 
              alt="Datatrixs Logo" 
              width={200} 
              height={60} 
              priority 
              className="object-contain"
            />
          </div>
          <CardTitle className="text-2xl font-bold font-headline text-foreground">Welcome back</CardTitle>
          <CardDescription>Enter your credentials to access your holdings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="name@company.com" 
                  className="pl-10 bg-muted/50 border-none focus-visible:ring-primary"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link href="#" className="text-xs text-primary hover:underline">Forgot password?</Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input 
                  id="password" 
                  type="password" 
                  className="pl-10 bg-muted/50 border-none focus-visible:ring-primary"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={loading}>
              {loading ? <Loader2 className="size-4 animate-spin mr-2" /> : "Sign In"}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-white/5" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
            </div>
          </div>

          <Button variant="outline" className="w-full border-white/10 hover:bg-white/5" onClick={handleGoogleLogin} disabled={loading}>
            <svg className="mr-2 size-5" viewBox="0 0 24 24">
              <path
                fill="#ea4335"
                d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582L19.91 3C17.782 1.145 15.055 0 12 0 7.273 0 3.191 2.727 1.091 6.718L5.266 9.765z"
              />
              <path
                fill="#34a853"
                d="M16.04 18.013c-1.09.703-2.474 1.078-4.04 1.078a7.077 7.077 0 0 1-6.723-4.823l-4.22 3.206C3.136 21.318 7.218 24 12 24c3.159 0 5.89-.982 7.91-2.673l-3.87-3.314z"
              />
              <path
                fill="#4285f4"
                d="M19.893 10.11H12v4.51h5.47c-.513 2.025-1.851 3.393-3.43 4.31l3.87 3.313C21.327 19.5 24 16.173 24 12c0-.655-.065-1.291-.187-1.89H19.893z"
              />
              <path
                fill="#fbbc05"
                d="M5.277 14.268A7.12 7.077 0 0 1 4.909 12c0-.782.127-1.536.357-2.235L1.091 6.718C.4 8.282 0 10.091 0 12c0 1.909.4 3.718 1.091 5.282l4.186-3.014z"
              />
            </svg>
            Google
          </Button>
        </CardContent>
        <CardFooter className="flex flex-wrap justify-center gap-1 text-sm text-muted-foreground">
          Don't have an account?
          <Link href="/register" className="text-primary hover:underline font-medium">Create one</Link>
        </CardFooter>
      </Card>
    </div>
  )
}
