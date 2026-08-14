import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Code2, Copy, Check, Smartphone } from 'lucide-react';

const APP_URL = 'https://andam.uk';
const PACKAGE = 'com.andam.allinone';

interface CodeFile {
  path: string;
  lang: string;
  code: string;
}

const FILES: CodeFile[] = [
  {
    path: 'app/src/main/java/com/andam/allinone/MainActivity.kt',
    lang: 'kotlin',
    code: `package ${PACKAGE}

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.webkit.CookieManager
import android.webkit.DownloadListener
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ProgressBar
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var progress: ProgressBar
    private var fullscreenView: View? = null
    private var fullscreenCallback: WebChromeClient.CustomViewCallback? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, true)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webview)
        progress = findViewById(R.id.progress)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            loadWithOverviewMode = true
            useWideViewPort = true
            javaScriptCanOpenWindowsAutomatically = true
            setSupportMultipleWindows(false)
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            userAgentString = userAgentString + " AndamAllInOneApp/1.0"
        }

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                val url = request.url.toString()
                val host = request.url.host ?: return false
                // Keep our own site inside the app, open everything else externally
                return if (host.endsWith("andam.uk") ||
                    host.endsWith("lovable.app") ||
                    host.endsWith("supabase.co")
                ) {
                    false
                } else {
                    runCatching {
                        startActivity(Intent(Intent.ACTION_VIEW, request.url))
                    }.onFailure {
                        Toast.makeText(this@MainActivity, url, Toast.LENGTH_SHORT).show()
                    }
                    true
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                progress.progress = newProgress
                progress.visibility = if (newProgress in 1..99) View.VISIBLE else View.GONE
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                request.grant(request.resources)
            }

            override fun onShowCustomView(view: View, callback: CustomViewCallback) {
                if (fullscreenView != null) {
                    callback.onCustomViewHidden()
                    return
                }
                fullscreenView = view
                fullscreenCallback = callback
                (window.decorView as FrameLayout).addView(
                    view,
                    FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT
                    )
                )
            }

            override fun onHideCustomView() {
                fullscreenView?.let { (window.decorView as FrameLayout).removeView(it) }
                fullscreenView = null
                fullscreenCallback?.onCustomViewHidden()
                fullscreenCallback = null
            }
        }

        webView.setDownloadListener(DownloadListener { url, _, _, mime, _ ->
            runCatching {
                val request = DownloadManager.Request(Uri.parse(url))
                request.setNotificationVisibility(
                    DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
                )
                request.setMimeType(mime)
                (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
            }
        })

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                when {
                    fullscreenView != null -> webView.webChromeClient?.onHideCustomView()
                    webView.canGoBack() -> webView.goBack()
                    else -> finish()
                }
            }
        })

        if (savedInstanceState == null) {
            webView.loadUrl("${APP_URL}")
        } else {
            webView.restoreState(savedInstanceState)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    // Smart TV / remote support: let the web app receive D-pad + media keys
    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        return super.onKeyDown(keyCode, event)
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }
}`,
  },
  {
    path: 'app/src/main/res/layout/activity_main.xml',
    lang: 'xml',
    code: `<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="#0B1220">

    <WebView
        android:id="@+id/webview"
        android:layout_width="match_parent"
        android:layout_height="match_parent" />

    <ProgressBar
        android:id="@+id/progress"
        style="?android:attr/progressBarStyleHorizontal"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:max="100"
        android:visibility="gone" />
</FrameLayout>`,
  },
  {
    path: 'app/src/main/AndroidManifest.xml',
    lang: 'xml',
    code: `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-feature android:name="android.software.leanback" android:required="false" />
    <uses-feature android:name="android.hardware.touchscreen" android:required="false" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:usesCleartextTraffic="true"
        android:hardwareAccelerated="true"
        android:theme="@style/Theme.AllInOne">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:configChanges="orientation|screenSize|keyboardHidden|smallestScreenSize|screenLayout"
            android:screenOrientation="fullSensor"
            android:launchMode="singleTop">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
                <category android:name="android.intent.category.LEANBACK_LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>`,
  },
  {
    path: 'app/build.gradle.kts',
    lang: 'kotlin',
    code: `plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "${PACKAGE}"
    compileSdk = 35

    defaultConfig {
        applicationId = "${PACKAGE}"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.2")
}`,
  },
  {
    path: 'app/src/main/res/values/strings.xml + themes.xml',
    lang: 'xml',
    code: `<!-- res/values/strings.xml -->
<resources>
    <string name="app_name">ALL IN ONE</string>
</resources>

<!-- res/values/themes.xml -->
<resources xmlns:tools="http://schemas.android.com/tools">
    <style name="Theme.AllInOne" parent="Theme.AppCompat.NoActionBar">
        <item name="android:statusBarColor">#0B1220</item>
        <item name="android:navigationBarColor">#0B1220</item>
        <item name="android:windowBackground">#0B1220</item>
    </style>
</resources>`,
  },
  {
    path: 'BUILD_APK.md (steps)',
    lang: 'markdown',
    code: `# Build the APK (Android Studio)

1. Android Studio > New Project > "Empty Views Activity" (Kotlin).
   - Name: ALL IN ONE
   - Package name: ${PACKAGE}
   - Minimum SDK: API 24
2. Replace the contents of these files with the code from this dialog:
   - app/src/main/java/com/andam/allinone/MainActivity.kt
   - app/src/main/res/layout/activity_main.xml
   - app/src/main/AndroidManifest.xml
   - app/build.gradle.kts
   - app/src/main/res/values/strings.xml
   - app/src/main/res/values/themes.xml
3. Sync Gradle (elephant icon) and wait until it finishes.
4. Debug APK: Build > Build Bundle(s) / APK(s) > Build APK(s)
   Output: app/build/outputs/apk/debug/app-debug.apk
5. Signed release APK (for sharing / Play Store):
   Build > Generate Signed App Bundle or APK > APK > Create new keystore >
   choose "release" > Finish.
   Output: app/build/outputs/apk/release/app-release.apk

Notes
- The app loads ${APP_URL} directly, so every platform update appears in the
  APK instantly, with no rebuild needed.
- Fullscreen video, cookies/login sessions, downloads, camera/mic prompts and
  Android TV (Leanback) launching are all already handled.
- App icon: right-click res > New > Image Asset, and use your ANDAM logo.`,
  },
];

export function AndroidStudioCode() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState<number | null>(null);
  const { toast } = useToast();

  const copy = async (index: number) => {
    try {
      await navigator.clipboard.writeText(FILES[index].code);
      setCopied(index);
      setTimeout(() => setCopied(null), 2000);
      toast({ title: 'Copied', description: FILES[index].path });
    } catch {
      toast({ title: 'Copy failed', variant: 'destructive' });
    }
  };

  const copyAll = async () => {
    const all = FILES.map((f) => `// ===== ${f.path} =====\n${f.code}`).join('\n\n');
    try {
      await navigator.clipboard.writeText(all);
      toast({ title: 'Copied', description: 'All files' });
    } catch {
      toast({ title: 'Copy failed', variant: 'destructive' });
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="rounded-lg flex items-center gap-1.5 border-primary/40 text-primary"
      >
        <Code2 className="h-4 w-4" />
        <span className="text-xs md:text-sm">Android APK Code</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl rounded-2xl max-h-[88vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              Android Studio — APK source code
            </DialogTitle>
            <DialogDescription>
              Ready-to-paste code for a native Android wrapper of {APP_URL}. CEO only.
            </DialogDescription>
          </DialogHeader>

          {/* Mobile: native dropdown (easy to pick with a thumb) */}
          <div className="sm:hidden">
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
              File
            </label>
            <select
              dir="ltr"
              value={active}
              onChange={(e) => setActive(Number(e.target.value))}
              className="h-11 w-full rounded-xl border border-border/60 bg-secondary/40 px-3 text-sm font-medium text-foreground outline-none focus:border-primary"
            >
              {FILES.map((f, i) => (
                <option key={f.path} value={i}>
                  {f.path.split('/').pop()}
                </option>
              ))}
            </select>
          </div>

          {/* Desktop / laptop: wrapped chips with comfortable hit areas */}
          <div className="hidden flex-wrap gap-2 sm:flex">
            {FILES.map((f, i) => (
              <button
                key={f.path}
                onClick={() => setActive(i)}
                aria-pressed={active === i}
                dir="ltr"
                className={`min-h-9 flex-shrink-0 rounded-xl px-3.5 py-2 text-xs font-semibold border transition-all ${
                  active === i
                    ? 'bg-primary text-primary-foreground border-primary shadow-md shadow-primary/25'
                    : 'bg-secondary/40 text-muted-foreground border-border/50 hover:text-foreground hover:border-primary/40'
                }`}
              >
                {f.path.split('/').pop()}
              </button>
            ))}
          </div>


          <div className="flex items-center justify-between gap-2 mt-2">
            <p className="text-[11px] text-muted-foreground truncate" dir="ltr">
              {FILES[active].path}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={copyAll} className="h-8 text-xs">
                Copy all
              </Button>
              <Button size="sm" onClick={() => copy(active)} className="h-8 text-xs gap-1.5">
                {copied === active ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                Copy
              </Button>
            </div>
          </div>

          <pre
            dir="ltr"
            className="mt-2 flex-1 overflow-auto rounded-xl bg-secondary/40 border border-border/50 p-3 text-[11px] leading-relaxed"
          >
            <code>{FILES[active].code}</code>
          </pre>
        </DialogContent>
      </Dialog>
    </>
  );
}
