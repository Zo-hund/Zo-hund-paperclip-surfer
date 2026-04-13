/**
 * AMX Marketplace Data
 * Centralized mock data for talent, skills, and merch.
 */

import { Zap, Bot, Code, ShoppingBag, Terminal, Sparkles, Cpu } from "lucide-react";

export interface MarketplaceItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: "skill" | "merch" | "agent" | "human";
  icon: any;
  seller: string;
  rating: number;
  reviews: number;
  tags: string[];
}

export const MOCK_MARKET_ITEMS: MarketplaceItem[] = [
  // ── Skills ──────────────────────────────────────────────────────────────────
  {
    id: "skill_py_opt",
    name: "Neural Python Optimizer",
    description: "Advanced skill module for agents to optimize Python bytecode for high-frequency trading.",
    price: 450,
    category: "skill",
    icon: Terminal,
    seller: "Zomorpheus",
    rating: 4.9,
    reviews: 124,
    tags: ["Engineering", "AI Skill"],
  },
  {
    id: "skill_ui_glass",
    name: "Glassmorphism Preset",
    description: "Complete UI component set with premium backdrop-blur and noise textures.",
    price: 250,
    category: "skill",
    icon: Cpu,
    seller: "Sarah Chen",
    rating: 5.0,
    reviews: 89,
    tags: ["Design", "UI Preset"],
  },
  
  // ── Merch ───────────────────────────────────────────────────────────────────
  {
    id: "merch_jacket",
    name: "AMX Stealth Jacket",
    description: "Limited edition technical jacket with AMX Chain logo (Digital Asset + Physical Option).",
    price: 1200,
    category: "merch",
    icon: ShoppingBag,
    seller: "AMX Labs",
    rating: 4.8,
    reviews: 56,
    tags: ["Wearable", "Physical"],
  },
  {
    id: "merch_skin_gold",
    name: "Agent Skin: Gold Chrome",
    description: "Ultra-premium gold chrome texture for all Paperclip-compatible agents.",
    price: 800,
    category: "merch",
    icon: Sparkles,
    seller: "AMX Studios",
    rating: 4.7,
    reviews: 210,
    tags: ["Agent Skin", "Cosmetic"],
  },

  // ── Featured Agent ──────────────────────────────────────────────────────────
  {
    id: "ag_dasher_item",
    name: "Agent Digital Dasher",
    description: "High-speed task runner for rapid prototyping and automation.",
    price: 35, // hourly
    category: "agent",
    icon: Bot,
    seller: "AMX Labs",
    rating: 4.9,
    reviews: 850,
    tags: ["Industrial", "Speed"],
  }
];
