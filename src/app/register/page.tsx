'use client';

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Mail, Lock, User, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth, useUser } from "@/firebase"
import { initiateEmailSignUp } from "@/firebase/non-blocking-login"

export default function RegisterPage() {
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const auth = useAuth()
  const { user, isUserLoading } = useUser()
  const router = useRouter()

  React.useEffect(() => {
    if (!isUserLoading && user) {
      router.push("/dashboard")
    }
  }, [user, isUserLoading, router])

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    initiateEmailSignUp(auth, email, password)
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
          <div className="mx-auto mb-6">
            <Image 
              src="/dx-logo.png" 
              alt="Datatrixs Logo" 
              width={180} 
              height={50} 
              priority 
              className="object-contain mx-auto"
            />
          </div>
          <CardTitle className="text-2xl font-bold font-headline">Create an account</CardTitle>
          <CardDescription>Get started with Datatrixs portfolio management</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input 
                  id="name" 
                  type="text" 
                  placeholder="John Doe" 
                  className="pl-10 bg-muted/50 border-none focus-visible:ring-primary"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            </div>
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
              <Label htmlFor="password">Password</Label>
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
              {loading ? <Loader2 className="size-4 animate-spin mr-2" /> : "Sign Up"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-wrap justify-center gap-1 text-sm text-muted-foreground">
          Already have an account?
          <Link href="/login" className="text-primary hover:underline font-medium">Log in</Link>
        </CardFooter>
      </Card>
    </div>
  )
}
