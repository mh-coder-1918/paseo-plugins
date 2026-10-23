Open PDF files in a workspace panel beside your agents, terminals, and files.

The panel lists the PDFs in the workspace directory, and you can also open any PDF on the daemon machine by its absolute path or a path starting with `~/`. Pages are shown one at a time with previous and next controls and zoom from 50% to 300%. It works in the desktop app and on mobile clients.

Pages are rendered to images on the daemon with macOS PDFKit, so the daemon must run on macOS with the Xcode Command Line Tools installed. The renderer is compiled once on first use and cached in `~/Library/Caches/paseo-pdf-viewer`. Text in the rendered pages cannot be selected or searched.

Open it from the Command Center with "Open PDF viewer", or from the workspace and Explorer panel menus.
