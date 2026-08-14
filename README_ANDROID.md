# ڕێنمایی دروستکردنی APK بۆ Android Studio

ئەم کۆدە لە بەشی **Admin Panel → Android APK Code** (تەنها بۆ CEO) دەیبینیت. کۆدێکی تەواوە بۆ Android Studio لەسەر بنەمای WebView، تایبەت بە پلاتفۆڕمی ANDAM.

## پێداویستیەکان

- Android Studio (Hedgehog یان نوێتر)
- JDK 17 (لە Android Studio خۆکار دانەبەزێت)
- Windows / Mac / Linux — هەموو یەکسانە

## هەنگاو ١: کردنەوەی Android Studio

1. Android Studio بکەرەوە.
2. **New Project** → **Empty Views Activity** (واتە Kotlin بە Layoutی XML، نەک Compose).
3. لە کاتی دروستکردنەوەدا ئەم بەهاوانە دابنێ:
   - **Name:** `ANDAM`
   - **Package name:** `com.andam.allinone`
   - **Minimum SDK:** `API 24: Android 7.0`
   - **Language:** Kotlin
   - **Build configuration language:** Kotlin DSL

## هەنگاو ٢: کۆپی کردنی فایلەکان

لە بەشی Admin Panel لە ماڵپەڕەکە، دوگمەی **Android APK Code** بکەوە (تەنها بۆ `andam@outlook.com`). لە دیالۆگەکەدا ئەم فایلانە کۆپی بکە و ناوەڕۆکیان لە Android Studio بەم شێوەیە بگۆرە:

| سەرچاوە (Android APK Code) | شوێنی بیبەڕێکەوتنەوە (Android Studio) |
|---|---|
| `MainActivity.kt` | `app/src/main/java/com/andam/allinone/MainActivity.kt` |
| `activity_main.xml` | `app/src/main/res/layout/activity_main.xml` |
| `AndroidManifest.xml` | `app/src/main/AndroidManifest.xml` |
| `app/build.gradle.kts` | `app/build.gradle.kts` |
| `strings.xml` | `app/src/main/res/values/strings.xml` |
| `themes.xml` | `app/src/main/res/values/themes.xml` |

> ئاگاداری: بە کۆتاییدا لە سەرەتای هەر فایلێکدا `package com.andam.allinone` دێت — دڵنیابەرەوە لە هاوکێشەیی ناوی پەکەیج.

## هەنگاو ٣: سینک کردنی Gradle

- لە Android Studio، دوگمەی **Sync Project with Gradle Files** (ئایکۆنی فیل) بکەوە.
- چاوەڕێ بکە تا دابەزاندن و سینک کردن تەواو ببێت (یەکەم جار ئەگەرییە چەند خولەک بخایەنێت).

## هەنگاو ٤: دروستکردنی Debug APK

1. سەرەوە منووی **Build** بکەوە.
2. **Build Bundle(s) / APK(s)** → **Build APK(s)**
3. لە کۆتاییدا ئاگاداریەکە دێت: **Locate** → فایلەکە لێرەیە:

```
app/build/outputs/apk/debug/app-debug.apk
```

ئەم APKیە بۆ تاقیکردنەوەی ناوخۆییە، نەک بەڵێنکراو بۆ بڵاوکردنەوە.

## هەنگاو ٥: دروستکردنی Signed Release APK

بۆ بڵاوکردنەوە یان دابەزاندن لە تەلیفۆن، پێویستە APKی تایبەت (release) بە مۆرکردن دروست بکەیت:

1. **Build** → **Generate Signed App Bundle or APK...**
2. **APK** هەڵبژێرە → **Next**
3. لە ژێر Key store:
   - ئەگەر یەکەم جارە: **Create new...** → شوێن و ناو و تێپەڕەوشە دابنێ، دوای ئەوە **OK**.
   - ئەگەر هەیە: **Choose existing...** بکەوە.
4. **release** هەڵبژێرە (نەک debug).
5. **Finish** بکەوە.

APKی تەواوکراو لێرەیە:

```
app/build/outputs/apk/release/app-release.apk
```

## تێبینی گرنگ

- ئەم APKیە تەنها WebViewی پێشکەوتووە — ناوەوە هەر ماڵپەڕی `https://andam.uk` دەکاتەوە. بۆیە گۆڕانکاری لە ماڵپەڕدا خۆکارانە لە APKیشدا دەردەکەوێت، بەبێ نوێکردنەوەی APK.
- پشتگیری تەواو هەیە بۆ: ڤیدیۆی فوول سکرین، داگرتن، کامێرا/مایکرۆفۆن، کووکییەکان و سێشن، Android TV (Leanback)، و دوگمەکانی ڕیموت کۆنترۆل.
- ئایکۆنی ئەپ: ڕاست کلیک لەسەر `res` → **New** → **Image Asset**، پاشان لۆگۆی ANDAM بەکاربێنە.

## چاککردنی کێشە

| کێشە | چارەسەر |
|---|---|
| Gradle sync شکست دەهێنێت | دڵنیابەرەوە لە JDK 17: `File → Settings → Build → Build Tools → Gradle → Gradle JDK` |
| Package mismatch error | بزانە سەرجەم فایلی Kotlin ناوی پەکەیج `com.andam.allinone` بێت |
| ئەپ بەرز نابێتەوە | `Build → Clean Project`، پاشان `Rebuild Project` |
| Android TV نیشان نادات | دڵنیابەرەوە لە `<category android:name="android.intent.category.LEANBACK_LAUNCHER" />` لە Manifest |
