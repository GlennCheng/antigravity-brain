import * as vscode from 'vscode';
import { BrainManager } from '../brain/BrainManager';

export class WebviewManager {
    public static currentPanel: WebviewManager | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, private brainManager: BrainManager) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    public static createOrShow(extensionUri: vscode.Uri, brainManager: BrainManager) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it.
        if (WebviewManager.currentPanel) {
            WebviewManager.currentPanel._panel.reveal(column);
            return;
        }

        // Otherwise, create a new panel.
        const panel = vscode.window.createWebviewPanel(
            'antigravityBrain',
            'Antigravity Brain',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')]
            }
        );

        WebviewManager.currentPanel = new WebviewManager(panel, extensionUri, brainManager);
    }

    public dispose() {
        WebviewManager.currentPanel = undefined;

        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private async _update() {
        const webview = this._panel.webview;
        this._panel.webview.html = await this._getHtmlForWebview(webview);
    }

    private async _getHtmlForWebview(webview: vscode.Webview) {
        // Local path to main script run in the webview
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js'));

        // Simulating the graph data injection
        const graph = await this.brainManager.buildGraph();
        
        // We will send the data via postMessage after the webview is loaded, 
        // OR we can embed it in a script tag (faster for initial load).
        // Let's embed it for now.
        const graphJson = JSON.stringify(graph);

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Antigravity Brain</title>
            <style>
                body, html { width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; background-color: #1e1e1e; }
                #root { width: 100%; height: 100%; }
            </style>
        </head>
        <body>
            <div id="root"></div>
            <script>
                window.initialData = ${graphJson};
                // Auto-post message to self to compatibility with the event listener in App.tsx if needed
                // But App.tsx currently listens to 'message' from window.
                // We can also just pass it as props if we were mounting it differently, 
                // but since we bundle, global var is easiest for sync injection.
                
                // Let's also emit it as an event for the React app to catch if it mounts later
                window.addEventListener('load', () => {
                     setTimeout(() => {
                        window.postMessage({ type: 'updateGraph', data: ${graphJson} }, '*');
                     }, 500);
                });
            </script>
            <script src="${scriptUri}"></script>
        </body>
        </html>`;
    }
}
