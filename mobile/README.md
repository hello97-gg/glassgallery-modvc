# 📱 standlone Glass Gallery Android Application

Welcome to your standalone Android codebase! This repository is completely decoupled from the web application, giving you 100% freedom to modify layouts, install native plugins, and run the app independently.

---

## 🚀 Getting Started

Follow these simple steps to install dependencies and run your app:

### 1. Install Dependencies
Run this command at the root of this directory to install all unified packages:
```bash
npm install
```

### 2. Build and Sync Code
Compile your visual React pages and synchronize the compiled bundle with the native Android code in one quick step:
```bash
npm run build
npx cap sync
```

### 3. Open in Android Studio
Launch Android Studio and open the native wrapper inside the `./android` folder:
```bash
npx cap open android
```

---

## 📁 standlone Structure

* **`App.tsx` & `components/`**: The visual React modules (Vite app).
* **`android/`**: The actual native Android project.
* **`capacitor.config.json`**: The wrapper configuration (pointing to local `dist/`).
* **`package.json`**: Unified package management (web build + Capacitor scripts).

---

## ⚡ Unified Scripts

Run these scripts from your command line:
* `npm run dev`: Launch the local hot-reload web server.
* `npm run build`: Compile Vite production assets.
* `npm run sync`: Sync assets with Android.
* `npm run android`: Compile and deploy directly to your connected device/emulator!
