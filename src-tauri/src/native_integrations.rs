// Native macOS integrations driven via osascript.
//
// Why this lives in Rust (not the Node sidecar):
// macOS attributes Apple Events (Automation) permission to the parent process
// of `osascript`. Spawning from Rust means the prompt and grant attach to
// Hark.app — survives bundle moves and notarization. Spawning from the Node
// sidecar would attach to "node", which is fragile in packaged builds.
//
// Values pass via `osascript -- argv` so quotes/newlines in user content
// can't break the script.

use std::process::Command;

fn run_osascript(script: &str, args: &[&str]) -> Result<String, String> {
    let mut cmd = Command::new("osascript");
    cmd.arg("-e").arg(script).arg("--");
    for a in args {
        cmd.arg(a);
    }

    let output = cmd
        .output()
        .map_err(|e| format!("failed to launch osascript: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("osascript exited with status {}", output.status)
        } else {
            stderr
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Append an entry to today's daily Hark note (creating it if missing).
/// Note title is computed in Rust from the current local date so the format
/// stays consistent regardless of caller: `Hark_Notes_April_25_2026`.
#[tauri::command]
pub fn add_to_notes(entry_title: String, entry_body: Option<String>) -> Result<(), String> {
    let body = entry_body.unwrap_or_default();
    // AppleScript renders Notes bodies as HTML. Use <div>/<br> for line breaks.
    // Find-or-create the note by exact name in the default account's "Notes" folder.
    let script = r#"
        on run argv
            set entryTitle to item 1 of argv
            set entryBody to item 2 of argv

            -- Daily container: Hark_Notes_<Month>_<Day>_<Year> in local time
            set monthNames to {"January","February","March","April","May","June","July","August","September","October","November","December"}
            set today to current date
            set noteTitle to "Hark_Notes_" & (item (month of today as integer) of monthNames) & "_" & (day of today) & "_" & (year of today)

            set ts to do shell script "date '+%-I:%M %p'"
            set entryHtml to "<div><b>" & ts & " &mdash; " & entryTitle & "</b></div>"
            if entryBody is not "" then
                set entryHtml to entryHtml & "<div>" & entryBody & "</div>"
            end if
            set entryHtml to entryHtml & "<div><br></div>"

            tell application "Notes"
                set targetAccount to default account
                set targetFolder to missing value
                tell targetAccount
                    repeat with f in folders
                        if name of f is "Notes" then
                            set targetFolder to f
                            exit repeat
                        end if
                    end repeat
                    if targetFolder is missing value then
                        set targetFolder to first folder
                    end if
                end tell

                set foundNote to missing value
                tell targetFolder
                    repeat with n in notes
                        if name of n is noteTitle then
                            set foundNote to n
                            exit repeat
                        end if
                    end repeat
                end tell

                if foundNote is missing value then
                    tell targetFolder
                        make new note with properties {name:noteTitle, body:"<h1>" & noteTitle & "</h1>" & entryHtml}
                    end tell
                else
                    set existingBody to body of foundNote
                    set body of foundNote to existingBody & entryHtml
                end if
            end tell
        end run
    "#;

    run_osascript(script, &[&entry_title, &body]).map(|_| ())
}
