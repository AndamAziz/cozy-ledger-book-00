import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ShieldCheck, Lock, KeyRound, Database, Mail, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const sections = [
  {
    icon: Lock,
    title: "Data protection",
    body: "Every account's data is isolated using database row-level security. Trades, bots, logs, notifications and financial records are scoped to the signed-in user, so one account can never read another account's data.",
  },
  {
    icon: KeyRound,
    title: "Authentication & access control",
    body: "Access requires a verified, approved account. Roles are stored separately from profiles and enforced on the server, so privileges cannot be elevated from the browser. Sensitive admin actions are restricted to authorized administrators.",
  },
  {
    icon: Database,
    title: "Secure backend",
    body: "Business logic and secrets run on the server inside protected functions. Service credentials are never shipped to the browser, and internal database helpers cannot be called by anonymous visitors.",
  },
  {
    icon: Mail,
    title: "Email & privacy",
    body: "Transactional emails (such as password resets) are sent over an authenticated sender domain. Email addresses used for suppression and unsubscribe handling are kept private and accessible only to backend processes.",
  },
];

export default function Trust() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>Trust & Security | City Taxperts</title>
        <meta
          name="description"
          content="How City Taxperts protects your data, privacy, and account security."
        />
      </Helmet>

      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to app
        </Link>

        <div className="mt-6 flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-3 text-primary">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Trust & Security</h1>
            <p className="text-sm text-muted-foreground">
              How we protect your account and data.
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {sections.map(({ icon: Icon, title, body }) => (
            <Card key={title}>
              <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                <Icon className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">{title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {body}
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="mt-8 text-xs text-muted-foreground">
          This page describes security and privacy practices maintained by the
          app team. It is provided for transparency and is not an independent
          certification. If you have a security concern, please contact the app
          administrator.
        </p>
      </div>
    </div>
  );
}
