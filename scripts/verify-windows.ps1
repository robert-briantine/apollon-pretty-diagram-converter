# Cas manuel : desktop-natif-windows-installation-webview2-et-export-autonome
# À exécuter sur Windows 10/11 x64 après installation du paquet NSIS.
param([string]$Application = "$env:LOCALAPPDATA\Diagrammes\diagrammes-activite.exe")
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Windows 10/11 x64 avec WebView2 et un opérateur est requis.' }
if (-not (Test-Path -LiteralPath $Application)) {
    throw "Installez Diagrammes_0.1.0_x64-setup.exe puis indiquez -Application si son chemin diffère : $Application"
}
function Confirmer([string]$Consigne) {
    if ((Read-Host "$Consigne — saisir OK après vérification") -cne 'OK') {
        throw "Vérification non effectuée ou échouée : $Consigne"
    }
}
$processus = Start-Process -FilePath $Application -PassThru
try {
    Confirmer 'Sélectionner diagram.json et générer : 18 nœuds, 24 arcs, textes/accents, flèches et légende lisibles'
    Confirmer 'Vérifier zoom, plein écran, taille réelle, clavier et fenêtre étroite'
    Confirmer 'Annuler un enregistrement puis enregistrer diagram.svg par le dialogue natif'
    $svgPath = Read-Host 'Chemin absolu du SVG enregistré depuis diagram.json'
    [xml]$svg = [System.IO.File]::ReadAllText($svgPath, [System.Text.Encoding]::UTF8)
    if ($svg.DocumentElement.LocalName -ne 'svg' -or $svg.DocumentElement.NamespaceURI -ne 'http://www.w3.org/2000/svg') {
        throw 'Le fichier enregistré ne contient pas un SVG valide.'
    }
    foreach ($attendu in @(@('noeud', 18), @('chemin', 24))) {
        $xpath = "//*[contains(concat(' ',normalize-space(@class),' '),' $($attendu[0]) ')]"
        if ($svg.SelectNodes($xpath).Count -ne $attendu[1]) { throw "Nombre incorrect : $($attendu[0])" }
    }
    Confirmer 'Ouvrir ce SVG séparément dans un navigateur hors ligne et constater le même rendu'
    Confirmer 'Sélectionner un JSON invalide : erreur visible sans ancien aperçu ; sélectionner ensuite un autre JSON valide et vérifier son nom et son export'
    Confirmer 'Fermer toutes les fenêtres de consultation et les onglets ouverts pour ce test'
    Write-Output 'PASS desktop-natif-windows-installation-webview2-et-export-autonome'
} finally {
    $processus.Refresh()
    if (-not $processus.HasExited) {
        $null = $processus.CloseMainWindow()
        if (-not $processus.WaitForExit(10000)) { Stop-Process -Id $processus.Id }
    }
}
