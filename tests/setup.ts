import { TextDecoder, TextEncoder } from 'node:util';

const Uint8Array = Object.getPrototypeOf(new TextEncoder().encode('')).constructor;

Object.assign(globalThis, { TextDecoder, TextEncoder, Uint8Array });
