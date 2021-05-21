import * as flags from "https://deno.land/std@0.97.0/flags/mod.ts";
import { MatrixMonitor, MonitorOptions } from "./matrix-monitor.ts";

const args = flags.parse(Deno.args);

const opt: MonitorOptions = {
    url: args["url"] || "https://matrix.papers.tech",
    interval: args["interval"] || 30000,
    timeout: args["timeout"],
}

new MatrixMonitor(opt).start();
