import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Mail, Send, ArrowLeft, MessageSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Contact() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>Contact Us | Andam IPTV</title>
        <meta
          name="description"
          content="Get in touch with Andam support for subscription questions and technical assistance."
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
            <MessageSquare className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Contact Us</h1>
            <p className="text-sm text-muted-foreground">
              We are here to help and answer any questions you might have.
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center gap-3 space-y-0">
              <Mail className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Email Support</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <a href="mailto:Info@andam.uk" className="text-primary hover:underline font-medium">
                Info@andam.uk
              </a>
              <p className="mt-1">We respond within 24 hours.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center gap-3 space-y-0">
              <Send className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Telegram</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <a href="https://t.me/AndamAziz" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
                @AndamAziz
              </a>
              <p className="mt-1">Direct message for instant inquiries.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
