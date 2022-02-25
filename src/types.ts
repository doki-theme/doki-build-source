interface HasColors {
  colors: StringDictionary<string>;
}

export interface Overrides {
  editorScheme: HasColors;
}

export interface DokiThemeDefinitions {
  [key: string]: any;
}

export interface MasterDokiThemeDefinition {
  id: string;
  characterId: string;
  name: string;
  displayName: string;
  conflictName?: string;
  dark: boolean;
  author: string;
  group: string;
  overrides?: Overrides;
  product?: 'community' | 'ultimate';
  stickers: Stickers;
  colors: StringDictionary<string>;
  editorScheme?: EditorScheme;
}

export interface EditorScheme {
  colors: StringDictionary<string>
}

export interface StringDictionary<T> {
  [key: string]: T;
}

export interface Sticker {
  name: string;
  opacity: number;
  anchor: 'left' | 'right' | 'center';
}

export interface Stickers {
  default: Sticker;
  secondary?: Sticker;
  normal?: string;
}

interface BackgroundPositioning {
  anchor: string;
  opacity?: number;
}

interface BackgroundPositionings {
  default?: BackgroundPositioning;
  secondary?: BackgroundPositioning;
}

export interface BaseAppDokiThemeDefinition {
  id: string;
  overrides: {
    editorScheme?: {
      [key: string]: StringDictionary<string>
    }
    theme?: {
      [key: string]: StringDictionary<string>
    }
  };
  laf: {
    extends: string;
    ui: StringDictionary<string>;
  };
  backgrounds?: BackgroundPositionings;
  syntax: {};
  colors: {};
}
