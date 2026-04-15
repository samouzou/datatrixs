'use client';

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Mail, Lock, User, Loader2, Store, Cpu, Cloud, Briefcase, Building2, FlaskConical, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth, useUser, useFirestore } from "@/firebase"
import { initiateEmailSignUp } from "@/firebase/non-blocking-login"
import { BusinessVertical } from "@/lib/types"
import { VERTICALS, VerticalConfig } from "@/lib/verticals"
import { cn } from "@/lib/utils"

const VERTICAL_ICONS: Record<BusinessVertical, React.ElementType> = {
  retail: Store,
  hardware: Cpu,
  saas: Cloud,
  services: Briefcase,
  biotech: FlaskConical,
  other: Building2,
}

const VERTICAL_LIST = Object.values(VERTICALS)

function VerticalCard({
  config,
  selected,
  onSelect,
}: {
  config: VerticalConfig
  selected: boolean
  onSelect: () => void
}) {
  const Icon = VERTICAL_ICONS[config.id]
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        selected
          ? "border-primary bg-primary/10 shadow-md shadow-primary/10"
          : "border-white/5 bg-muted/30 hover:border-white/20 hover:bg-muted/50"
      )}
    >
      <div className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg",
        selected ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
      )}>
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <p className={cn("text-sm font-semibold leading-none mb-0.5", selected ? "text-primary" : "text-foreground")}>
          {config.label}
        </p>
        <p className="text-[11px] text-muted-foreground leading-snug truncate">{config.description}</p>
      </div>
    </button>
  )
}

export default function RegisterPage() {
  const [step, setStep] = React.useState<1 | 2>(1)
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [selectedVertical, setSelectedVertical] = React.useState<BusinessVertical | null>(null)
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

  const handleCredentialsSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setStep(2)
  }

  const handleFinalSubmit = () => {
    if (!selectedVertical) return
    setLoading(true)

    const nameParts = name.trim().split(' ')
    const firstName = nameParts[0] || ''
    const lastName = nameParts.slice(1).join(' ') || ''

    // Store the selected vertical so the first company creation can pick it up
    if (typeof window !== 'undefined') {
      localStorage.setItem('pendingVertical', selectedVertical)
    }

    initiateEmailSignUp(auth, db, email, password, { firstName, lastName })
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
              src="/dx-logo.svg"
              alt="Datatrixs Logo"
              width={180}
              height={50}
              priority
              className="object-contain mx-auto"
            />
          </div>

          {step === 1 ? (
            <>
              <CardTitle className="text-2xl font-bold font-headline text-foreground">Create an account</CardTitle>
              <CardDescription>Get started with Datatrixs portfolio management</CardDescription>
            </>
          ) : (
            <>
              <CardTitle className="text-2xl font-bold font-headline text-foreground">What kind of business?</CardTitle>
              <CardDescription>This helps us tailor the platform to your needs</CardDescription>
            </>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {step === 1 ? (
            <form onSubmit={handleCredentialsSubmit} className="space-y-4">
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
              <Button type="submit" className="w-full bg-primary hover:bg-primary/90">
                Continue <ChevronRight className="ml-2 size-4" />
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-2">
                {VERTICAL_LIST.map((config) => (
                  <VerticalCard
                    key={config.id}
                    config={config}
                    selected={selectedVertical === config.id}
                    onSelect={() => setSelectedVertical(config.id)}
                  />
                ))}
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep(1)}
                  disabled={loading}
                >
                  Back
                </Button>
                <Button
                  className="flex-1 bg-primary hover:bg-primary/90"
                  onClick={handleFinalSubmit}
                  disabled={!selectedVertical || loading}
                >
                  {loading ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                  Create Account
                </Button>
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex flex-wrap justify-center gap-1 text-sm text-muted-foreground">
          Already have an account?
          <Link href="/login" className="text-primary hover:underline font-medium">Log in</Link>
        </CardFooter>
      </Card>
    </div>
  )
}
