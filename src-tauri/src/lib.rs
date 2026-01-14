use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

mod agent_bridge;

use agent_bridge::AgentBridge;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub agent_type: String,
    pub name: String,
    pub working_dir: String,
    pub prompt: Option<String>,
    pub model: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub id: String,
    pub agent_type: String,
    pub name: String,
    pub status: String,
    pub working_dir: String,
    pub started_at: String,
}

pub struct AppState {
    bridge: Arc<Mutex<Option<AgentBridge>>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            bridge: Arc::new(Mutex::new(None)),
        }
    }
}

#[tauri::command]
async fn connect_to_runtime(state: State<'_, AppState>) -> Result<bool, String> {
    let mut bridge_guard = state.bridge.lock().await;

    match AgentBridge::connect("ws://127.0.0.1:9847").await {
        Ok(bridge) => {
            *bridge_guard = Some(bridge);
            Ok(true)
        }
        Err(e) => Err(format!("Failed to connect: {}", e))
    }
}

#[tauri::command]
async fn start_agent(
    state: State<'_, AppState>,
    config: AgentConfig,
) -> Result<Agent, String> {
    let bridge_guard = state.bridge.lock().await;

    if let Some(bridge) = bridge_guard.as_ref() {
        bridge.start_agent(config).await
    } else {
        Err("Not connected to agent runtime".to_string())
    }
}

#[tauri::command]
async fn stop_agent(
    state: State<'_, AppState>,
    agent_id: String,
) -> Result<(), String> {
    let bridge_guard = state.bridge.lock().await;

    if let Some(bridge) = bridge_guard.as_ref() {
        bridge.stop_agent(&agent_id).await
    } else {
        Err("Not connected to agent runtime".to_string())
    }
}

#[tauri::command]
async fn list_agents(state: State<'_, AppState>) -> Result<Vec<Agent>, String> {
    let bridge_guard = state.bridge.lock().await;

    if let Some(bridge) = bridge_guard.as_ref() {
        bridge.list_agents().await
    } else {
        Err("Not connected to agent runtime".to_string())
    }
}

#[tauri::command]
async fn get_agent(
    state: State<'_, AppState>,
    agent_id: String,
) -> Result<Option<Agent>, String> {
    let bridge_guard = state.bridge.lock().await;

    if let Some(bridge) = bridge_guard.as_ref() {
        bridge.get_agent(&agent_id).await
    } else {
        Err("Not connected to agent runtime".to_string())
    }
}

#[tauri::command]
async fn send_message(
    state: State<'_, AppState>,
    agent_id: String,
    message: String,
) -> Result<(), String> {
    let bridge_guard = state.bridge.lock().await;

    if let Some(bridge) = bridge_guard.as_ref() {
        bridge.send_message(&agent_id, &message).await
    } else {
        Err("Not connected to agent runtime".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            connect_to_runtime,
            start_agent,
            stop_agent,
            list_agents,
            get_agent,
            send_message,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
