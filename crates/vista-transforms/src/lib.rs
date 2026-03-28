//! Vista SWC Transforms
//!
//! This crate provides Rust-based transforms for Vista framework.
//!
//! Features:
//! - `'use client'` directive detection
//! - Component categorization (server vs client)
//! - RSC (React Server Components) build system
//! - Manifest generation
//! - RSC payload serialization

pub mod naming;
pub mod client_directive;
pub mod chain_transforms;
pub mod linter;
pub mod react_compiler;
pub mod rsc;
pub mod transforms;

pub use client_directive::*;
pub use chain_transforms::*;
pub use linter::*;
pub use react_compiler::*;
pub use rsc::*;
