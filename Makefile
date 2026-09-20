.PHONY: dev host web test install stop restart build rebuild pack

# 默认：装依赖并同时起 host(:3141) + Vite(:5173)

# 默认：装依赖并同时起 host(:3141) + Vite(:5173)
dev: install
	npm run dev

host:
	npm run dev:host

web:
	npm run dev:web

install:
	npm install

# 释放本项目常用端口（旧 make dev / vite / host 残留）
# SIGTERM 经常不够：tsx/vite/concurrently 会忽略或晚退，端口仍被占着。
stop:
	@for p in 3141 3142 5173; do \
	  pids=$$(lsof -nP -tiTCP:$$p -sTCP:LISTEN 2>/dev/null); \
	  if [ -n "$$pids" ]; then \
	    echo "kill :$$p -> $$pids"; \
	    kill $$pids 2>/dev/null || true; \
	    sleep 0.2; \
	    pids=$$(lsof -nP -tiTCP:$$p -sTCP:LISTEN 2>/dev/null); \
	    if [ -n "$$pids" ]; then echo "kill -9 :$$p -> $$pids"; kill -9 $$pids 2>/dev/null || true; fi; \
	  else echo ":$$p free"; fi; \
	done
	@for p in 3141 3142 5173; do \
	  i=0; \
	  while lsof -nP -tiTCP:$$p -sTCP:LISTEN >/dev/null 2>&1; do \
	    i=$$((i+1)); \
	    if [ $$i -gt 20 ]; then echo "port :$$p still in use after stop" >&2; exit 1; fi; \
	    sleep 0.1; \
	  done; \
	done

# 先停再启（等端口真正释放后再 dev）
restart: stop
	@$(MAKE) --no-print-directory dev

test:
	npm test

# Vite 生产构建。全仓 tsc 仍有历史债，不挡这条。
build:
	npm run build

# 打包后部署运行：先释放占用端口，再 vite build，最后 npm start（无 Vite，UI 由 :3141 提供 dist）
rebuild: stop build
	npm start

# macOS dmg / Windows exe：见 docs/desktop-install.md；CI tag v* 走 GitHub Release
pack:
	npm run electron:pack
