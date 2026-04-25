#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{
    CustomMenuItem, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu, WindowEvent,
};

// ── Managed state ─────────────────────────────────────────────────────────────

struct ListeningState(Mutex<bool>);

/// Holds the handle to the Node.js sidecar process so we can kill it on quit.
struct ServerChild(Mutex<Option<std::process::Child>>);

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
fn set_listening(
    app: tauri::AppHandle,
    state: tauri::State<ListeningState>,
    listening: bool,
) {
    let mut s = state.0.lock().unwrap();
    *s = listening;
    let label = if listening { "Pause Listening" } else { "Start Listening" };
    app.tray_handle().get_item("toggle").set_title(label).unwrap();
}

// ── Node sidecar spawn ────────────────────────────────────────────────────────

fn spawn_node_server() -> Option<std::process::Child> {
    // CARGO_MANIFEST_DIR is src-tauri/ at compile time; parent = project root
    let project_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()?
        .to_path_buf();

    let server_dir = project_root.join("server");
    let server_js  = server_dir.join("server.js");

    if !server_js.exists() {
        eprintln!("[hark] server/server.js not found — transcription disabled");
        return None;
    }

    // Auto-install npm deps on first run (blocks briefly; subsequent runs skip)
    if !server_dir.join("node_modules").exists() {
        println!("[hark] First run: installing server dependencies…");
        match std::process::Command::new("npm")
            .arg("install")
            .current_dir(&server_dir)
            .status()
        {
            Ok(s) if s.success() => println!("[hark] Server deps installed."),
            Ok(s)  => eprintln!("[hark] npm install exited with status {s}"),
            Err(e) => eprintln!("[hark] npm install failed: {e}"),
        }
    }

    match std::process::Command::new("node")
        .arg(&server_js)
        .current_dir(&server_dir)
        .spawn()
    {
        Ok(child) => {
            println!("[hark] Node server started (pid {})", child.id());
            Some(child)
        }
        Err(e) => {
            eprintln!("[hark] Could not start Node server: {e}");
            None
        }
    }
}

// ── Main ──────────────────────────────────────────────────────────────────────

fn main() {
    // Initial state: not listening (user must explicitly start)
    let open   = CustomMenuItem::new("open".to_string(),   "Open Hark");
    let toggle = CustomMenuItem::new("toggle".to_string(), "Start Listening");
    let quit   = CustomMenuItem::new("quit".to_string(),   "Quit");

    let tray_menu = SystemTrayMenu::new()
        .add_item(open)
        .add_item(toggle)
        .add_native_item(tauri::SystemTrayMenuItem::Separator)
        .add_item(quit);

    let tray = SystemTray::new().with_menu(tray_menu);

    // Spawn sidecar before building the Tauri app
    let server_child = spawn_node_server();

    tauri::Builder::default()
        .manage(ListeningState(Mutex::new(false)))
        .manage(ServerChild(Mutex::new(server_child)))
        .system_tray(tray)
        .invoke_handler(tauri::generate_handler![set_listening])
        .on_system_tray_event(|app, event| match event {
            SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
                "open" => {
                    if let Some(window) = app.get_window("main") {
                        window.show().unwrap();
                        window.set_focus().unwrap();
                    }
                }
                "toggle" => {
                    let state = app.state::<ListeningState>();
                    let mut listening = state.0.lock().unwrap();
                    *listening = !*listening;
                    let new_label = if *listening { "Pause Listening" } else { "Start Listening" };
                    app.tray_handle()
                        .get_item("toggle")
                        .set_title(new_label)
                        .unwrap();
                    app.emit_all("listening-changed", *listening).unwrap();
                }
                "quit" => {
                    // Kill the Node sidecar before exiting
                    let server = app.state::<ServerChild>();
                    if let Some(mut child) = server.0.lock().unwrap().take() {
                        let _ = child.kill();
                    }
                    std::process::exit(0);
                }
                _ => {}
            },
            // Left-click: menu opens automatically via menuOnLeftClick: true
            _ => {}
        })
        .on_window_event(|event| {
            if let WindowEvent::CloseRequested { api, .. } = event.event() {
                event.window().hide().unwrap();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error running Hark");
}
