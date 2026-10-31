#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::atomic::{AtomicU64, Ordering};
static NEXT_VIEWER: AtomicU64 = AtomicU64::new(0);

#[tauri::command]
async fn save_svg(svg: String, name: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let file = rfd::FileDialog::new()
            .set_title("Enregistrer le SVG")
            .add_filter("Image SVG", &["svg"])
            .set_file_name(&name)
            .save_file();
        match file {
            Some(path) => std::fs::write(path, svg)
                .map(|_| true)
                .map_err(|error| format!("Écriture impossible : {error}")),
            None => Ok(false), // Annuler n'est pas une erreur.
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn open_svg(app: tauri::AppHandle, svg: String, name: String) -> Result<(), String> {
    let label = format!("svg-{}", NEXT_VIEWER.fetch_add(1, Ordering::Relaxed));
    // Le SVG reste une image, jamais du HTML exécutable dans la fenêtre.
    let script = format!(
        "window.__diagramSvg = {};",
        serde_json::to_string(&svg).map_err(|e| e.to_string())?
    );
    tauri::WebviewWindowBuilder::new(&app, label, tauri::WebviewUrl::App("viewer.html".into()))
        .title(name)
        .inner_size(1200.0, 800.0)
        .initialization_script(&script)
        .build()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![save_svg, open_svg])
        .run(tauri::generate_context!())
        .expect("Impossible de démarrer Diagrammes d’activité");
}
