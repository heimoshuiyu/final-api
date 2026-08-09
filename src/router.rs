use axum::middleware::{from_fn_with_state};
use axum::routing::{delete, get, post, put};
use axum::Router;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

use crate::handler;
use crate::middleware::auth::{jwt_auth, jwt_auth_user_only, token_auth};
use crate::state::AppState;

pub fn build_router(state: AppState) -> Router {
    let cors = CorsLayer::permissive();

    // ---- Relay routes (token auth) ----
    let relay_routes = Router::<AppState>::new()
        .route("/v1/chat/completions", post(handler::relay::handler))
        .route("/v1/completions", post(handler::relay::handler))
        .route("/v1/messages", post(handler::relay::handler))
        .route("/v1/embeddings", post(handler::relay::handler))
        .route("/v1/responses", post(handler::relay::handler))
        .route("/v1/moderations", post(handler::relay::handler))
        .route("/v1/models", get(handler::relay::models))
        .layer(from_fn_with_state(state.clone(), token_auth));

    // ---- Public management routes (no auth) ----
    let public_api = Router::<AppState>::new()
        .route("/api/user/login", post(handler::user::login))
        .route("/api/user/register", post(handler::user::register))
        .route("/api/presets", get(handler::preset::list));

    // ---- User-level routes (JWT only, no workspace required) ----
    let user_api = Router::<AppState>::new()
        .route("/api/user/self", get(handler::user::self_info))
        .route("/api/user/workspaces", get(handler::user::list_workspaces))
        .route("/api/workspace", post(handler::workspace::create))
        .layer(from_fn_with_state(state.clone(), jwt_auth_user_only));

    // ---- Protected management routes (JWT + workspace) ----
    let protected_api = Router::<AppState>::new()
        // Workspace
        .route("/api/workspace", get(handler::workspace::info).put(handler::workspace::rename))
        .route("/api/workspace/members", get(handler::workspace::list_members))
        .route(
            "/api/workspace/members/{id}",
            delete(handler::workspace::remove_member).put(handler::workspace::update_member_role),
        )
        .route(
            "/api/workspace/invites",
            get(handler::workspace::list_invites).post(handler::workspace::create_invite),
        )
        .route(
            "/api/workspace/invites/{id}",
            delete(handler::workspace::delete_invite),
        )
        // Tokens
        .route(
            "/api/token",
            get(handler::token::list).post(handler::token::create),
        )
        .route(
            "/api/token/{id}",
            delete(handler::token::delete).put(handler::token::update),
        )
        // Channels
        .route(
            "/api/channel",
            get(handler::channel::list).post(handler::channel::create),
        )
        .route(
            "/api/channel/{id}",
            put(handler::channel::update).delete(handler::channel::delete),
        )
        // Logs
        .route("/api/log", get(handler::log::list))
        // Inspect
        .route("/api/inspect/stream", get(handler::inspect::stream))
        .layer(from_fn_with_state(state.clone(), jwt_auth));

    Router::<AppState>::new()
        .merge(relay_routes)
        .merge(public_api)
        .merge(user_api)
        .merge(protected_api)
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}
