import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Mail, Send, PlayCircle, CreditCard, ListPlus, MessageCircle, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const topics = [
  {
    icon: PlayCircle,
    title: "Playback problems",
    body: "A stream that will not start, keeps buffering, or plays with no sound. Send the channel or film name and the device you are on — it lets us find the problem far faster.",
  },
  {
    icon: CreditCard,
    title: "Billing & subscriptions",
    body: "Payments, renewals, or changing your plan. Write from the email address on the account so we can match it.",
  },
  {
    icon: ListPlus,
    title: "Content requests",
    body: "A channel or film you would like added. We cannot promise every request, but we do read all of them and they shape what we add next.",
  },
  {
    icon: MessageCircle,
    title: "Anything else",
    body: "Questions, feedback, or an idea for the app. Short messages are welcome.",
  },
];

export default function Contact() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>Contact | ANDAM</title>
        <meta
          name="description"
          content="Get in touch with the ANDAM team by email or Telegram."
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
            <Mail className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Contact Us</h1>
            <p className="text-sm text-muted-foreground">
              Get in touch and we will come back to you as soon as we can.
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <a
            href="mailto:info@andam.uk"
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50"
          >
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <Mail className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">Email</div>
              <div className="truncate text-sm font-semibold">info@andam.uk</div>
            </div>
          </a>

          <a
            href="https://t.me/AndamAziz"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50"
          >
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <Send className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">Telegram</div>
              <div className="truncate text-sm font-semibold">@AndamAziz</div>
            </div>
          </a>
        </div>

        <h2 className="mt-10 text-lg font-semibold">What we can help with</h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {topics.map(({ icon: Icon, title, body }) => (
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
          Before writing about playback, try a hard refresh first (Ctrl+Shift+R on
          desktop, or pull down to refresh on mobile). If it still fails, send us
          the name and we will look into it.
        </p>
      </div>
    </div>
  );
}
