use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio_tungstenite::{connect_async, tungstenite::Message};

use crate::{Agent, AgentConfig};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum RuntimeMessage {
    #[serde(rename = "start_agent")]
    StartAgent { config: AgentConfig },
    #[serde(rename = "stop_agent")]
    StopAgent { agent_id: String },
    #[serde(rename = "list_agents")]
    ListAgents,
    #[serde(rename = "get_agent")]
    GetAgent { agent_id: String },
    #[serde(rename = "send_message")]
    SendMessage { agent_id: String, message: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum RuntimeResponse {
    #[serde(rename = "agent")]
    Agent { agent: Agent },
    #[serde(rename = "agents")]
    Agents { agents: Vec<Agent> },
    #[serde(rename = "agent_optional")]
    AgentOptional { agent: Option<Agent> },
    #[serde(rename = "success")]
    Success,
    #[serde(rename = "error")]
    Error { message: String },
}

type WsSink = futures_util::stream::SplitSink<
    tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
    Message,
>;

type WsStream = futures_util::stream::SplitStream<
    tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
>;

pub struct AgentBridge {
    write: Arc<Mutex<WsSink>>,
    read: Arc<Mutex<WsStream>>,
}

impl AgentBridge {
    pub async fn connect(url: &str) -> Result<Self, String> {
        let (ws_stream, _) = connect_async(url)
            .await
            .map_err(|e| format!("Failed to connect: {}", e))?;

        let (write, read) = ws_stream.split();

        Ok(Self {
            write: Arc::new(Mutex::new(write)),
            read: Arc::new(Mutex::new(read)),
        })
    }

    async fn send_and_receive(&self, msg: RuntimeMessage) -> Result<RuntimeResponse, String> {
        let json = serde_json::to_string(&msg).map_err(|e| e.to_string())?;

        {
            let mut write = self.write.lock().await;
            write
                .send(Message::Text(json))
                .await
                .map_err(|e| e.to_string())?;
        }

        {
            let mut read = self.read.lock().await;
            if let Some(result) = read.next().await {
                match result {
                    Ok(Message::Text(text)) => {
                        serde_json::from_str(&text).map_err(|e| e.to_string())
                    }
                    Ok(_) => Err("Unexpected message type".to_string()),
                    Err(e) => Err(e.to_string()),
                }
            } else {
                Err("Connection closed".to_string())
            }
        }
    }

    pub async fn start_agent(&self, config: AgentConfig) -> Result<Agent, String> {
        let response = self
            .send_and_receive(RuntimeMessage::StartAgent { config })
            .await?;

        match response {
            RuntimeResponse::Agent { agent } => Ok(agent),
            RuntimeResponse::Error { message } => Err(message),
            _ => Err("Unexpected response".to_string()),
        }
    }

    pub async fn stop_agent(&self, agent_id: &str) -> Result<(), String> {
        let response = self
            .send_and_receive(RuntimeMessage::StopAgent {
                agent_id: agent_id.to_string(),
            })
            .await?;

        match response {
            RuntimeResponse::Success => Ok(()),
            RuntimeResponse::Error { message } => Err(message),
            _ => Err("Unexpected response".to_string()),
        }
    }

    pub async fn list_agents(&self) -> Result<Vec<Agent>, String> {
        let response = self.send_and_receive(RuntimeMessage::ListAgents).await?;

        match response {
            RuntimeResponse::Agents { agents } => Ok(agents),
            RuntimeResponse::Error { message } => Err(message),
            _ => Err("Unexpected response".to_string()),
        }
    }

    pub async fn get_agent(&self, agent_id: &str) -> Result<Option<Agent>, String> {
        let response = self
            .send_and_receive(RuntimeMessage::GetAgent {
                agent_id: agent_id.to_string(),
            })
            .await?;

        match response {
            RuntimeResponse::AgentOptional { agent } => Ok(agent),
            RuntimeResponse::Error { message } => Err(message),
            _ => Err("Unexpected response".to_string()),
        }
    }

    pub async fn send_message(&self, agent_id: &str, message: &str) -> Result<(), String> {
        let response = self
            .send_and_receive(RuntimeMessage::SendMessage {
                agent_id: agent_id.to_string(),
                message: message.to_string(),
            })
            .await?;

        match response {
            RuntimeResponse::Success => Ok(()),
            RuntimeResponse::Error { message } => Err(message),
            _ => Err("Unexpected response".to_string()),
        }
    }
}
