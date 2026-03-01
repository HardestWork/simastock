"""
Generate a professionally styled PDF from the user guide markdown.
Usage:  python docs/generate_pdf.py
Output: docs/Guide_Utilisateur_SGC.pdf
"""
from __future__ import annotations

import os
import re
import markdown
from xhtml2pdf import pisa

DOCS_DIR = os.path.dirname(os.path.abspath(__file__))
MD_PATH = os.path.join(DOCS_DIR, "guide_utilisateur.md")
PDF_PATH = os.path.join(DOCS_DIR, "Guide_Utilisateur_SGC.pdf")

CSS = """
@page {
    size: A4;
    margin: 2cm 2cm 2.5cm 2cm;
    @frame footer {
        -pdf-frame-content: footerContent;
        bottom: 0.5cm;
        margin-left: 2cm;
        margin-right: 2cm;
        height: 1.2cm;
    }
}

body {
    font-family: Helvetica, Arial, sans-serif;
    font-size: 10pt;
    line-height: 1.5;
    color: #1a1a1a;
}

/* Cover page */
.cover {
    text-align: center;
    padding-top: 6cm;
    page-break-after: always;
}
.cover h1 {
    font-size: 28pt;
    color: #1e3a5f;
    margin-bottom: 0.3cm;
    letter-spacing: 1px;
}
.cover .subtitle {
    font-size: 14pt;
    color: #4a6fa5;
    margin-bottom: 1cm;
}
.cover .version {
    font-size: 11pt;
    color: #666;
    margin-top: 2cm;
}
.cover .company {
    font-size: 10pt;
    color: #999;
    margin-top: 0.5cm;
}

/* TOC */
.toc {
    page-break-after: always;
}
.toc h2 {
    font-size: 18pt;
    color: #1e3a5f;
    border-bottom: 2px solid #1e3a5f;
    padding-bottom: 4px;
    margin-bottom: 12pt;
}
.toc ul {
    list-style: none;
    padding-left: 0;
}
.toc li {
    padding: 4pt 0;
    font-size: 11pt;
    border-bottom: 1px dotted #ccc;
}
.toc li a {
    color: #1e3a5f;
    text-decoration: none;
}

/* Headings */
h1 {
    font-size: 22pt;
    color: #1e3a5f;
    margin-top: 20pt;
    margin-bottom: 8pt;
    page-break-after: avoid;
}

h2 {
    font-size: 16pt;
    color: #1e3a5f;
    border-bottom: 2px solid #3b82f6;
    padding-bottom: 4pt;
    margin-top: 24pt;
    margin-bottom: 10pt;
    page-break-after: avoid;
}

h3 {
    font-size: 13pt;
    color: #2563eb;
    margin-top: 16pt;
    margin-bottom: 6pt;
    page-break-after: avoid;
}

h4 {
    font-size: 11pt;
    color: #1e40af;
    margin-top: 12pt;
    margin-bottom: 4pt;
}

/* Paragraphs */
p {
    margin-top: 4pt;
    margin-bottom: 6pt;
    text-align: justify;
}

/* Lists */
ul, ol {
    margin-top: 4pt;
    margin-bottom: 6pt;
    padding-left: 20pt;
}

li {
    margin-bottom: 3pt;
}

/* Bold */
strong {
    color: #1e3a5f;
}

/* Tables */
table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 8pt;
    margin-bottom: 8pt;
    font-size: 9pt;
}

th {
    background-color: #1e3a5f;
    color: white;
    padding: 6pt 8pt;
    text-align: left;
    font-weight: bold;
}

td {
    padding: 5pt 8pt;
    border-bottom: 1px solid #ddd;
    vertical-align: top;
}

tr:nth-child(even) td {
    background-color: #f0f4f8;
}

/* Blockquotes — info boxes */
blockquote {
    background-color: #eff6ff;
    border-left: 4px solid #3b82f6;
    padding: 8pt 12pt;
    margin: 8pt 0;
    font-size: 9.5pt;
    color: #1e40af;
}
blockquote p {
    margin: 2pt 0;
    text-align: left;
}

/* Code blocks — workflow diagrams */
pre {
    background-color: #f8f9fa;
    border: 1px solid #dee2e6;
    border-radius: 4pt;
    padding: 8pt 10pt;
    font-family: Courier, monospace;
    font-size: 9pt;
    margin: 6pt 0;
    white-space: pre-wrap;
    word-wrap: break-word;
}

code {
    background-color: #f0f0f0;
    padding: 1pt 3pt;
    border-radius: 2pt;
    font-family: Courier, monospace;
    font-size: 9pt;
}

/* Horizontal rules */
hr {
    border: none;
    border-top: 1px solid #ddd;
    margin: 16pt 0;
}

/* Footer */
#footerContent {
    text-align: center;
    font-size: 8pt;
    color: #999;
    border-top: 1px solid #ddd;
    padding-top: 4pt;
}
"""


def build_cover_html() -> str:
    return """
    <div class="cover">
        <h1>Syst&egrave;me de Gestion Commerciale</h1>
        <div class="subtitle">Guide Utilisateur</div>
        <div class="version">
            Documentation compl&egrave;te destin&eacute;e aux utilisateurs de la plateforme<br/>
            Version : Mars 2026
        </div>
        <div class="company">
            &copy; 2026 &mdash; Tous droits r&eacute;serv&eacute;s
        </div>
    </div>
    """


def build_toc_html() -> str:
    toc_items = [
        "Pr&eacute;sentation g&eacute;n&eacute;rale",
        "Premiers pas",
        "Tableau de bord",
        "Catalogue produits",
        "Gestion du stock",
        "Point de vente (POS)",
        "Devis et factures proforma",
        "Caisse et encaissements",
        "Gestion des clients",
        "Cr&eacute;dits et &eacute;ch&eacute;anciers",
        "Remboursements et avoirs",
        "Fournisseurs et achats",
        "Gestion des d&eacute;penses",
        "Alertes et notifications",
        "Rapports et statistiques",
        "Analytics avanc&eacute;es",
        "Objectifs et performance vendeurs",
        "CRM Commercial",
        "Gestion des ressources humaines (GRH)",
        "Administration et param&egrave;tres",
        "V&eacute;rification de documents",
        "R&ocirc;les et droits d'acc&egrave;s",
        "Questions fr&eacute;quentes (FAQ)",
    ]
    items_html = ""
    for i, title in enumerate(toc_items, 1):
        items_html += f"<li>{i}. {title}</li>\n"

    return f"""
    <div class="toc">
        <h2>Table des mati&egrave;res</h2>
        <ul>
            {items_html}
        </ul>
    </div>
    """


def md_to_html(md_text: str) -> str:
    """Convert markdown to HTML, skipping the title and TOC (we build our own)."""
    # Remove the first title line and TOC section
    lines = md_text.split("\n")
    content_lines = []
    skip_toc = False
    past_header = False
    for line in lines:
        # Skip the very first h1 title
        if not past_header and line.startswith("# "):
            past_header = True
            continue
        # Skip the "> Documentation complete..." and "> Version" lines
        if not past_header:
            continue
        if line.strip().startswith("> Documentation") or line.strip().startswith("> Version"):
            continue
        # Skip the TOC section
        if line.strip() == "## Table des matieres":
            skip_toc = True
            continue
        if skip_toc:
            if line.startswith("---"):
                skip_toc = False
                continue
            continue
        content_lines.append(line)

    md_body = "\n".join(content_lines)

    # Convert markdown to HTML
    html = markdown.markdown(
        md_body,
        extensions=["tables", "fenced_code"],
    )

    # Add page breaks before each h2 (major sections)
    html = html.replace("<h2>", '<h2 style="page-break-before: always;">')
    # But not the very first h2
    html = html.replace(
        '<h2 style="page-break-before: always;">',
        "<h2>",
        1,
    )

    return html


def build_full_html(md_text: str) -> str:
    cover = build_cover_html()
    toc = build_toc_html()
    body = md_to_html(md_text)

    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
{CSS}
</style>
</head>
<body>
    {cover}
    {toc}
    {body}

    <div id="footerContent">
        Syst&egrave;me de Gestion Commerciale &mdash; Guide Utilisateur &mdash; Mars 2026
    </div>
</body>
</html>"""


def generate_pdf():
    with open(MD_PATH, "r", encoding="utf-8") as f:
        md_text = f.read()

    html = build_full_html(md_text)

    # Debug: save HTML for inspection
    html_path = os.path.join(DOCS_DIR, "_guide_preview.html")
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html)

    with open(PDF_PATH, "wb") as pdf_file:
        status = pisa.CreatePDF(html, dest=pdf_file, encoding="utf-8")

    if status.err:
        print(f"ERROR: PDF generation failed with {status.err} errors.")
        return False

    size_kb = os.path.getsize(PDF_PATH) / 1024
    print(f"PDF generated: {PDF_PATH} ({size_kb:.0f} KB)")

    # Clean up debug HTML
    if os.path.exists(html_path):
        os.remove(html_path)

    return True


if __name__ == "__main__":
    generate_pdf()
