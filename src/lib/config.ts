import fs from 'fs';
import path from 'path';
import { parse } from 'smol-toml';
import type { I18nConfig } from '@/types/i18n';

function getLastUpdatedDate(locale?: string): string {
  const now = Date.now();
  let latestTime = 0;

  // Try to get the last git commit date first
  try {
    const { execSync } = require('child_process');
    const gitDate = execSync('git log -1 --format=%cd --date=iso', {
      cwd: process.cwd(),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();
    if (gitDate) {
      latestTime = new Date(gitDate).getTime();
    }
  } catch {
    // Git not available
  }

  // If no git date, get the most recent modification time from content files
  if (latestTime === 0) {
    const contentDir = path.join(process.cwd(), 'content');

    function scanDir(dir: string) {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath);
          } else {
            const stats = fs.statSync(fullPath);
            if (stats.mtimeMs > latestTime) {
              latestTime = stats.mtimeMs;
            }
          }
        }
      } catch {
        // Directory might not exist
      }
    }

    scanDir(contentDir);

    // Also check content_zh directory
    const contentZhDir = path.join(process.cwd(), 'content_zh');
    scanDir(contentZhDir);
  }

  // Use latest time or current time
  const date = latestTime > 0 ? new Date(latestTime) : new Date();

  // Format based on locale
  if (locale === 'zh') {
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

export interface SiteConfig {
  site: {
    title: string;
    description: string;
    favicon: string;
    last_updated?: string;
  };
  author: {
    name: string;
    title: string;
    institution: string;
    avatar: string;
  };
  social: {
    email?: string;
    location?: string;
    location_url?: string;
    location_details?: string[];
    google_scholar?: string;
    orcid?: string;
    github?: string;
    linkedin?: string;
    [key: string]: string | string[] | undefined;
  };
  features: {
    enable_likes: boolean;
    enable_one_page_mode?: boolean;
  };
  navigation: Array<{
    title: string;
    type: 'section' | 'page' | 'link';
    target: string;
    href: string;
  }>;
  sections?: Array<{
    id: string;
    type: 'markdown' | 'publications' | 'list' | 'cards';
    source?: string;
    title?: string;
    filter?: string;
    limit?: number;
  }>;
  i18n?: I18nConfig;
}

const DEFAULT_CONTENT_DIR = 'content';

function normalizeLocale(locale: string): string {
  return locale.trim().replace('_', '-').toLowerCase();
}

function readConfigFromPath(configPath: string): Partial<SiteConfig> | null {
  try {
    const fileContent = fs.readFileSync(configPath, 'utf-8');
    return parse(fileContent) as unknown as Partial<SiteConfig>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function mergeConfig(base: SiteConfig, localized?: Partial<SiteConfig> | null): SiteConfig {
  if (!localized) return base;

  return {
    ...base,
    site: {
      ...base.site,
      ...(localized.site || {}),
    },
    author: {
      ...base.author,
      ...(localized.author || {}),
    },
    social: {
      ...base.social,
      ...(localized.social || {}),
    },
    features: base.features,
    navigation: localized.navigation || base.navigation,
    sections: localized.sections || base.sections,
    // i18n is always sourced from default content/config.toml
    i18n: base.i18n,
  };
}

function getDefaultConfig(): SiteConfig {
  const defaultPath = path.join(process.cwd(), DEFAULT_CONTENT_DIR, 'config.toml');
  const parsed = readConfigFromPath(defaultPath);

  if (!parsed) {
    throw new Error('Failed to load content/config.toml');
  }

  // Auto-update last_updated based on git commit or file modification time
  const config = parsed as SiteConfig;
  config.site.last_updated = getLastUpdatedDate();

  return config;
}

export function getConfig(locale?: string): SiteConfig {
  try {
    const baseConfig = getDefaultConfig();

    if (!locale) {
      return baseConfig;
    }

    const normalizedLocale = normalizeLocale(locale);
    const localizedPath = path.join(process.cwd(), `${DEFAULT_CONTENT_DIR}_${normalizedLocale}`, 'config.toml');
    const localizedConfig = readConfigFromPath(localizedPath);

    const merged = mergeConfig(baseConfig, localizedConfig);

    // Update last_updated with locale-specific format
    merged.site.last_updated = getLastUpdatedDate(normalizedLocale);

    return merged;
  } catch (error) {
    console.error('Error loading config:', error);
    throw new Error('Failed to load configuration');
  }
}
