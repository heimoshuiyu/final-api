use axum::extract::State;
use axum::http::{header, HeaderValue, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use rust_embed::RustEmbed;

use crate::state::AppState;

#[derive(RustEmbed)]
#[folder = "frontend/dist/"]
struct FrontendAsset;

pub async fn static_handler(State(state): State<AppState>, uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');

    if path.ends_with(".txt") {
        let files = state.verification_files.read().await;
        if let Some(content) = files.get(path) {
            return (
                StatusCode::OK,
                [(header::CONTENT_TYPE, HeaderValue::from_static("text/plain"))],
                content.clone(),
            )
                .into_response();
        }
    }

    let (asset_path, file) = if path.is_empty() {
        ("index.html", FrontendAsset::get("index.html"))
    } else {
        let p: &str = path;
        (p, FrontendAsset::get(p))
    };

    match file {
        Some(content) => {
            let mime = mime_guess::from_path(asset_path).first_or_octet_stream();
            (
                StatusCode::OK,
                [(header::CONTENT_TYPE, HeaderValue::from_str(mime.as_ref()).unwrap())],
                content.data,
            )
                .into_response()
        }
        None => FrontendAsset::get("index.html")
            .map(|content| {
                (
                    StatusCode::OK,
                    [(header::CONTENT_TYPE, HeaderValue::from_static("text/html"))],
                    content.data,
                )
                    .into_response()
            })
            .unwrap_or_else(|| StatusCode::NOT_FOUND.into_response()),
    }
}
