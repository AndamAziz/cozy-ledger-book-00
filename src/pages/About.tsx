import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Tv, Film, Radio, TrendingUp, Moon, LayoutGrid, Sparkles, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const features = [
  { icon: Tv, title: "Live TV & Sport", body: "Live channels and sports streaming that play straight in your browser, with no extra software to install." },
  { icon: Film, title: "Movies & Series", body: "A large on-demand library of films and shows, with resume-where-you-left-off and full seek support." },
  { icon: Radio, title: "IPTV M3U", body: "Already have a playlist? Add your own M3U or Xtream source and watch it through the same player." },
  { icon: TrendingUp, title: "Trading", body: "Market prices, charts and price alerts for the instruments you follow, without opening a separate app." },
  { icon: Moon, title: "Prayer Times & Qibla", body: "Accurate prayer times and Qibla direction based on your location, with reminders when you want them." },
  { icon: LayoutGrid, title: "ANDAM Hub", body: "Everything else in one dashboard, so you are never more than a tap away from the tool you need." },
];

export default function About() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>About | ANDAM</title>
        <meta name="description" content="ANDAM is an all-in-one app: live TV, films, market data and prayer times, under one login." />
      </Helmet>

      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to app
        </Link>

        <div className="mt-6 flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-3 text-primary">
            <Sparkles className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">About ANDAM</h1>
            <p className="text-sm text-muted-foreground">Four apps worth of tools, under one login.</p>
          </div>
        </div>

        <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
          Most people keep a streaming app, a market app and a prayer app on the same phone,
          and switch between all three every day. ANDAM brings them together. Watch live TV
          and films, follow the markets, and check prayer times in one place, on any device,
          with a single account.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {features.map(({ icon: Icon, title, body }) => (
            <Card key={title}>
              <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                <Icon className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">{title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{body}</CardContent>
            </Card>
          ))}
        </div>

        <h2 className="mt-10 text-lg font-semibold">Built independently</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          ANDAM is built and maintained by a small independent team. Features get added based
          on what people actually ask for, so if something is missing or broken, telling us is
          the fastest way to see it change. The review box on the home page comes straight to
          us, or you can{" "}
          <Link to="/contact" className="text-primary hover:underline">get in touch directly</Link>.
        </p>

        <p className="mt-8 text-xs text-muted-foreground">
          Channel and content availability depends on your subscription and your own configured sources.
        </p>
      </div>
    </div>
  );
}
