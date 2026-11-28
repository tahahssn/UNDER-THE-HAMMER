"use strict";
/**
 * @package contracts
 *
 * Shared TypeScript contract/DTO definitions for Under The Hammer.
 * These define the shape of data transmitted between frontend and backend.
 *
 * All contracts are type-safe with strict TypeScript mode.
 * No `any` types are used.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
__exportStar(require("./files.contract"), exports);
__exportStar(require("./players.contract"), exports);
__exportStar(require("./teams.contract"), exports);
__exportStar(require("./subscriptions.contract"), exports);
__exportStar(require("./rooms.contract"), exports);
__exportStar(require("./realtime.contract"), exports);
__exportStar(require("./exports.contract"), exports);
//# sourceMappingURL=index.js.map