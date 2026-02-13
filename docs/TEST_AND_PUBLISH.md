# Antigravity Brain Extension - Testing & Publishing Guide

這份文件說明如何在本機測試 Antigravity Brain 擴充功能，以及如何將其打包發布。

## 1. 本機透過 VS Code 測試 (Extension Development Host)

這是開發過程中最常用的測試方式。

1.  **開啟專案**：使用 VS Code 開啟 `antigravity-brain` 資料夾。
2.  **安裝依賴** (如果尚未安裝)：
    ```bash
    npm install
    ```
3.  **編譯程式碼**：
    確保 Webview 和 Extension 都已編譯。
    ```bash
    npm run compile
    ```
    *(或者在 VS Code 中按下 `Ctrl+Shift+B` 執行 Watch 任務，可以即時編譯)*

4.  **啟動除錯 (Debug)**：
    - 按下 `F5` 鍵，或者點擊左側 Activity Bar 的 "Run and Debug" 圖示，確認上方選單選擇 "Run Extension"，然後點擊綠色播放鍵。
    - 這會開啟一個新的 VS Code 視窗，標題列會顯示 `[Extension Development Host]`。

5.  **測試功能**：
    - 在新視窗中，開啟 Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)。
    - 輸入 `Antigravity Brain: Open Graph` 並執行，確認 Mind Map Webview 是否順利開啟。
    - 在左側 Side Bar 查看是否出現 "Antigravity Brain" 的圖示，點擊後應顯示檔案樹狀結構。

## 2. 打包成 .vsix 檔案 (Side-load)

如果你想在一般的 VS Code 環境中安裝，而不是除錯模式，可以打包成 `.vsix` 檔案。

1.  **安裝 vsce 工具** (如果尚未安裝)：
    ```bash
    npm install -g @vscode/vsce
    ```

2.  **打包**：
    在專案根目錄執行：
    ```bash
    vsce package
    ```
    - 如果遇到 `README.md` 或 `LICENSE` 缺失的警告，請確保這些檔案存在。
    - 成功後，會產生一個 `antigravity-brain-0.0.1.vsix` (版號依 `package.json` 而定) 的檔案。

3.  **安裝**：
    - 在你的 VS Code 中，進入 Extensions View (`Ctrl+Shift+X`)。
    - 點擊右上角的 "..." 選單。
    - 選擇 "Install from VSIX..."。
    - 選擇剛剛產生的 `.vsix` 檔案。

## 3. 發布到 VS Code Marketplace

要讓全世界都能下載，你需要發布到 Marketplace。

1.  **建立 Azure DevOps Organization** (如果沒有)：
    - 前往 [Azure DevOps](https://dev.azure.com/) 建立一個免費組織。

2.  **建立 Personal Access Token (PAT)**：
    - 在 Azure DevOps 右上角 User Settings -> Personal access tokens。
    - New Token。
    - Organization: "All accessible organizations".
    - Scopes: 選擇 "Marketplace", 勾選 "Acquire" 和 "Manage"。
    - 複製這個 Token (只會顯示一次)。

3.  **建立 Publisher**：
    - 前往 [VS Code Marketplace management page](https://marketplace.visualstudio.com/manage)。
    - 使用微軟帳號登入。
    - Create Publisher (例如 ID 取名為 `glenn-antigravity`)。

4.  **登入 vsce**：
    ```bash
    vsce login <your-publisher-id>
    ```
    - 輸入剛剛的 PAT。

5.  **發布**：
    ```bash
    vsce publish
    ```
    - 這會自動執行 `npm run vscode:prepublish` (即 `npm run compile`)，然後上傳。
    - 發布後通常需要幾分鐘驗證，之後就可以在 Extension Store 搜尋到了。

6.  **更新版本**：
    - 修正 bug 或新增功能後，更新 `package.json` 的版本號，或者使用：
      ```bash
      vsce publish patch # 0.0.1 -> 0.0.2
      vsce publish minor # 0.0.1 -> 0.1.0
      vsce publish major # 0.0.1 -> 1.0.0
      ```
