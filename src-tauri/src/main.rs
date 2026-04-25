#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use tauri::{
    CustomMenuItem, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu, WindowEvent,
};

struct ListeningState(Mutex<bool>);

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

fn main() {
    let open   = CustomMenuItem::new("open".to_string(),   "Open Hark");
    let toggle = CustomMenuItem::new("toggle".to_string(), "Pause Listening");
    let quit   = CustomMenuItem::new("quit".to_string(),   "Quit");

    let tray_menu = SystemTrayMenu::new()
        .add_item(open)
        .add_item(toggle)
        .add_native_item(tauri::SystemTrayMenuItem::Separator)
        .add_item(quit);

    let tray = SystemTray::new().with_menu(tray_menu);

    tauri::Builder::default()
        .manage(ListeningState(Mutex::new(true)))
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
                    // Notify the frontend so its toggle button stays in sync
                    app.emit_all("listening-changed", *listening).unwrap();
                }
                "quit" => std::process::exit(0),
                _ => {}
            },
            // Left-click: menu opens automatically (menuOnLeftClick: true in tauri.conf.json)
            // No extra handler needed — do NOT show the window here.
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
