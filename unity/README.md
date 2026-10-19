# 🎮 Unity محلي + CI/CD على جهازك — الدليل الكامل

> **الفكرة في سطر:** كل تعديل في مجلد `unity/` يتعمله **اختبارات + build + نصب على موبايلك** تلقائي — الأول بسكربت على جهازك، وبعدين ممكن يبقى CI حقيقي شغّال **على جهازك** عبر GitHub Self-hosted Runner.

---

## 0) هل محتاج Unity أصلاً؟ (نصيحة صريحة)

| الهدف | الحل |
| --- | --- |
| APK + اختبار على الموبايل للألعاب الحالية (NEON WRECKAGE / BLOCK NOVA / NEON FIST) | **مش محتاج Unity** — GitHub Actions بيعمل ده دلتي (شوف `.github/workflows/`) |
| 3D، فيزياء متقدمة، شيدرات، محرك كامل، أدوات محرر | **Unity مناسب هنا** ✔ |
| تطوير ألعاب جديدة بمحرك وتبنيها على طول | الدليل ده |

---

## 1) التحميل والمواصفات

1. حمّل **[Unity Hub](https://unity.com/download)** (الحساب مجاني).
2. من Hub نزّل **Unity LTS** (2022.3 LTS أو Unity 6.x) — وخلّي الموديولات متعلّمة:
   - **Android Build Support** ← مكوّناتها التلاتة: **SDK + NDK + OpenJDK** (Hub بينزّلهم لوحدهم).
   - اختياري: WebGL Build Support (لو هتنشر على GitHub Pages).
3. مواصفات الجهاز:
   - Windows 10/11 (64-bit) أو Linux أو macOS.
   - **RAM:** 16GB مريح (الحد الأدنى 8GB).
   - **قرص:** ~25GB حر (Editor ~4GB + Android modules ~6GB + Library المشروع 2-5GB).
   - كارت شاشة اختياري — البناء بيشتغل بالبروسيسور عادي.

## 2) الرخصة (مجانية)

- **Unity Personal** مجاني طول ما دخلك أقل من $200K/سنة — سجّل دخول من Hub وهيتفعّل على جهازك أوتوماتيك.
- **للبناء السحابي (game-ci)** هتحتاج ملف رخصة `.ulf`:
  - من Unity Hub → **Settings → License Management → Manual activation**، أو
  - الملف بيتحفظ في `C:\ProgramData\Unity\Unity_lic.ulf` (ويندوز).
  - تحط محتواه في سر اسمه `UNITY_LICENSE` في GitHub → Settings → Secrets.

## 3) إنشاء المشروع جوه الريبو

- Unity Hub → **Add** → اختار مجلد `unity/` الموجود هنا.
- أول فتحة هيولّد `ProjectSettings/` و`Library/` (الاتنين في `.gitignore` — بيتعملوا build على كل جهاز).
- اعمل مشهد واحد على الأقل: `Assets/Scenes/Game.unity` وسجّله في **File → Build Settings**.
- **`Assets/Editor/BuildScript.cs` موجود جاهز** — هو نقطة الدخول للبناء الآلي (Android APK + WebGL).

## 4) خط الأنابيب المحلي (سكربت واحد)

```powershell
# ويندوز (PowerShell) — من جذر الريبو:
powershell -ExecutionPolicy Bypass -File scripts\unity-local-build.ps1

# خيارات:
#   -SkipTests          ← يتخطى الاختبارات
#   -InstallDevice      ← ينصّب الـ APK على الموبايل بعد البناء (adb)
#   -BuildTarget webgl  ← بدل أندرويد
#   -Il2cpp             ← بناء نهائي أدق وأصغر (أبطأ شوية)
#   -UnityExe 'C:\...\Unity.exe'  ← لو مسار الـ Unity مش قياسي
```

```bash
# لينكس/ماك (WSL ينفع كمان):
bash scripts/unity-local-build.sh
bash scripts/unity-local-build.sh --skip-tests --install-device --il2cpp
```

**اللي بيحصل جوه السكربت:**
1. **EditMode tests** → `unity/TestResults/EditMode.xml`
2. **PlayMode tests** → `unity/TestResults/PlayMode.xml`
3. **Build** → `unity/Builds/Android/NEON-UNITY.apk` (أو `unity/Builds/WebGL/`)
4. **adb install -r** على موبايلك (لو طلبت `-InstallDevice`)

## 5) CI حقيقي على جهازك — GitHub Self-hosted Runner ⭐

ده معناه: **أي push** فيه تعديلات على `unity/` → GitHub Actions بيشتغل **على جهازك** → build + اختبارات + نصب على الموبايل.

1. على GitHub: **Settings → Actions → Runners → New self-hosted runner**.
2. نفّذ الأوامر اللي بتديها GitHub على جهازك:
   ```powershell
   .\config.cmd --url https://github.com/zeroonetwo680-bit/my-first-game --token XXXXX
   .\svc install   # يسجّلها كخدمة ويندوز تشتغل مع الجهاز
   .\svc start
   ```
3. افتح `.github/workflows/unity-selfhosted.yml` و**شيل التعليق** عن قسم `push:` — كده كل تعديل يتبني أوتوماتيك.
4. من غير ما تعمل push؟ افتح الـ workflow على GitHub ودوس **Run workflow** (workflow_dispatch) — برضه بيشتغل على جهازك.

> ⚠️ الـ Runner شغّال على جهازك = لازم يكون مفتوح ومتصل بالنت وقت البناء. وده **الأمان**: الأكواد مش بتخرج من جهازك.

## 6) البديل: بناء سحابي على GitHub (game-ci)

- ملف: `.github/workflows/unity-cloud.yml` — **تشغيل يدوي** (workflow_dispatch) لحد ما تجهز الرخصة.
- ارفع 3 secrets: `UNITY_LICENSE` (محتوى ملف `.ulf`) + `UNITY_EMAIL` + `UNITY_PASSWORD`.
- **الميزة:** الريبو **public** → دقايق Linux على Actions **مجانية بلا حدود**.
- **العيب:** أول بيلد بياخد **15-25 دقيقة** (تنزيل صورة Unity والـ Library من الصفر).

## 7) الاختبار على الموبايل

| الطريقة | ازاي |
| --- | --- |
| **USB** | فعّل USB Debugging → `adb devices` لازم يشوف التليفون → السكربت بيعمل `adb install -r` |
| **WiFi** | مرة على USB: `adb tcpip 5555` → بعدين `adb connect <IP-الموبايل>:5555` |
| **Unity Remote 5** | تطبيق من Play Store — بيشغّل اللعبة من الـ Editor على الموبايل فورًا (جودة مخفوضة، ممتاز لاختبار اللمس) |

## 8) تكامل مستقبلي: WebGL على GitHub Pages

- `BuildScript.BuildWebGL` بيطلع في `unity/Builds/WebGL/` — نقدر بعدين نضيفه كـ Pages جنب الألعاب الحالية (زي `prepare-web.sh` بالظبط).

## استكشاف الأخطاء

| المشكلة | الحل |
| --- | --- |
| `Unity.exe not found` | مرر `-UnityExe 'C:\Program Files\Unity\Hub\Editor\<version>\Editor\Unity.exe'` |
| اختبارات فاشلة | افتح `unity/TestResults/*.xml` — كل فشل مكتوب بالتفصيل |
| البناء فشل | اقرا اللوج في التيرمنال (السكربت بيمرر `-logFile -`) |
| `adb` مش موجود | نزّل [Platform-Tools](https://developer.android.com/tools/releases/platform-tools) أو مرر `-AdbExe` |
| الـ Runner ما شغّلش | اتأكد إن `svc status` شغال و`config.cmd` اتعمل صح |
