import * as flags from "https://deno.land/std@0.97.0/flags/mod.ts";
import { MatrixMonitor, MonitorOptions } from "./matrix-monitor.ts";
import * as log from "https://deno.land/std@0.97.0/log/mod.ts";
import { BaseHandler } from "https://deno.land/std@0.97.0/log/handlers.ts";
import { LogRecord } from "https://deno.land/std@0.97.0/log/logger.ts";

class LogHandler extends BaseHandler {
    log(msg: string): void {
        console.log(msg);
    }
}

const args = flags.parse(Deno.args);

const opt: MonitorOptions = {
    url: args["url"] || "https://matrix.papers.tech",
    interval: args["interval"] || 30000,
    timeout: args["timeout"],
}

// mimic a structured JSON logger
await log.setup({
    handlers: {
        default: new LogHandler("INFO", {
            formatter: (r: LogRecord) => {
                const res = {
                    timestamp: r.datetime,
                    level: r.levelName,
                    msg: r.msg,
                    ...(Object.assign({}, ...r.args)),
                };
                return JSON.stringify(res);
            }
        }),
    },
});

new MatrixMonitor(opt).start();
