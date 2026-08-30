import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Tv, ArrowLeft, ShieldCheck, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function About() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>About Us | Andam IPTV</title>
        <meta
          name="description"
          content="Learn more about Andam, a modern IPTV streaming platform delivering live TV, movies, and series."
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
            <Tv className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">About Us</h1>
            <p className="text-sm text-muted-foreground">
              Your seamless and secure streaming destination.
            </p>
          </div>
        </div>

        <div className="mt-8 space-y-6 text-sm text-muted-foreground leading-relaxed">
          <p>
            Andam is a modern IPTV streaming platform built to deliver Live TV, Movies, and Series through one seamless, reliable experience. We provide access to a constantly updated library of 40,000+ channels spanning entertainment, sports, and international programming, sourced and maintained to consistently high standards.
          </p>
          <p>
            Security and performance are at the core of what we do. Every account is protected with encrypted credential storage and restricted admin access, and our infrastructure is continuously monitored to keep streaming smooth and dependable.
          </p>
          <p>
            Whether you are following live sports, catching up on a series, or exploring something new, Andam is designed to make streaming simple, secure, and enjoyable — anytime, anywhere.
          </p>
        </div>
      </div>
    </div>
  );
}
