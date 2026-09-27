import { version } from "../../package.json";

/** The studio's release version, straight from package.json. */
export const APP_VERSION: string = version;

/** Anything with a pre-release tag (alpha, beta, rc…) is not a stable release yet. */
export const IS_PRERELEASE = APP_VERSION.includes("-");
