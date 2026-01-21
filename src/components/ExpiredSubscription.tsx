import { Button } from '@/components/ui/button';
import { AlertTriangle, MessageCircle, LogOut, Calendar, Shield } from 'lucide-react';

interface ExpiredSubscriptionProps {
  email: string;
  expiresAt: Date;
  onLogout: () => void;
}

export function ExpiredSubscription({ email, expiresAt, onLogout }: ExpiredSubscriptionProps) {
  const handleWhatsAppContact = () => {
    const message = encodeURIComponent(
      `سڵاو، کاتی بەکارهێنانی ئەکاونتم (${email}) لە City Taxperts ئەپ بەسەرچووە و داوای درێژکردنەوەی دەکەم.`
    );
    window.open(`https://wa.me/447482828237?text=${message}`, '_blank');
  };

  const expiredDate = new Date(expiresAt).toLocaleDateString('ku-Arab', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-0 left-0 w-full h-full">
        <div className="absolute top-20 left-10 w-72 h-72 rounded-full bg-destructive/20 blur-[100px] animate-pulse" />
        <div className="absolute bottom-20 right-10 w-80 h-80 rounded-full bg-warning/20 blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <div className="w-full max-w-md relative z-10 animate-scale-in">
        <div className="relative overflow-hidden rounded-3xl border border-destructive/30 bg-card/60 backdrop-blur-2xl shadow-2xl shadow-destructive/10">
          {/* Top gradient bar */}
          <div className="h-1.5 bg-gradient-to-l from-destructive via-warning to-primary" />
          
          <div className="p-8 md:p-10">
            {/* Warning Icon */}
            <div className="text-center mb-8">
              <div className="relative inline-block mb-6">
                <div className="w-28 h-28 rounded-full bg-gradient-to-br from-destructive/20 to-destructive/5 mx-auto flex items-center justify-center border-4 border-destructive/30 shadow-2xl shadow-destructive/20">
                  <AlertTriangle className="h-14 w-14 text-destructive animate-pulse" />
                </div>
              </div>

              <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-l from-destructive via-warning to-foreground bg-clip-text text-transparent mb-3">
                کاتی بەکارهێنان بەسەرچوو
              </h1>
              
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/50 border border-border/50 mb-4">
                <Shield className="h-4 w-4 text-primary" />
                <span className="text-sm text-foreground">{email}</span>
              </div>
            </div>

            {/* Expired Message */}
            <div className="bg-destructive/10 rounded-2xl p-6 mb-6 border border-destructive/20">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-destructive/20 flex items-center justify-center flex-shrink-0">
                  <Calendar className="h-6 w-6 text-destructive" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-2">بەروار: {expiredDate}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    ماوەی بەکارهێنانی ئەپەکە بەسەرچووە. تکایە لە ماوەی <span className="text-destructive font-bold">٧ ڕۆژ</span> دا پەیوەندی بە بەڕێوەبەرەوە بکە بۆ دووبارە بەکارهێنانەوەی ئەپەکە.
                  </p>
                  <p className="text-xs text-muted-foreground mt-3 bg-secondary/50 p-2 rounded-lg">
                    ⚠️ داتاکانت پارێزراون و لەدوای نوێکردنەوە دەتوانی بەکاریان بهێنیت.
                  </p>
                </div>
              </div>
            </div>

            {/* WhatsApp Contact Button */}
            <Button 
              onClick={handleWhatsAppContact}
              className="w-full py-7 text-lg font-bold rounded-xl shadow-xl bg-[#25D366] hover:bg-[#20BD5A] text-white hover:scale-[1.02] transition-all duration-300 mb-4"
            >
              <div className="flex items-center gap-3">
                <MessageCircle className="h-6 w-6" />
                پەیوەندی بۆ نوێکردنەوە
              </div>
            </Button>

            <p className="text-center text-xs text-muted-foreground mb-6">
              ژمارە: <span dir="ltr" className="font-mono">+44 7482 828 237</span>
            </p>

            {/* Logout Button */}
            <Button 
              variant="outline"
              onClick={onLogout}
              className="w-full py-5 rounded-xl border-border/50 hover:bg-secondary/50"
            >
              <div className="flex items-center gap-2">
                <LogOut className="h-4 w-4" />
                چوونەدەرەوە
              </div>
            </Button>

            {/* Footer */}
            <div className="mt-8 pt-6 border-t border-border/30 text-center">
              <p className="text-xs text-muted-foreground">
                بەڕێوەبەری گشتی: andam@outlook.com
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
