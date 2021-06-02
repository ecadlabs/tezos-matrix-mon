FROM hayd/deno:1.10.2

WORKDIR /app

# Prefer not to run as root.
USER deno

ADD *.ts /app/
# Compile the main app so that it doesn't need to be compiled each startup/entry.
RUN deno cache monitor.ts

# These are passed as deno arguments when run with docker:
ENTRYPOINT ["deno", "run", "--allow-net", "monitor.ts", "run", "--allow-net", "monitor.ts"]
