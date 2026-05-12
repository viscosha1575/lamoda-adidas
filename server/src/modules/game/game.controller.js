export function createGameController({ gameService }) {
  return {
    async getState(request, response) {
      const state = await gameService.getState(request.player.id);
      response.json({ data: state });
    },

    async start(request, response) {
      const state = await gameService.startSession(request.player.id, request.body);
      response.status(201).json({ data: state });
    },

    async pause(request, response) {
      const state = await gameService.pauseSession(request.player.id);
      response.json({ data: state });
    },

    async resume(request, response) {
      const state = await gameService.resumeSession(request.player.id);
      response.json({ data: state });
    },

    async heartbeat(request, response) {
      const state = await gameService.recordHeartbeat(request.player.id);
      response.json({ data: state });
    },

    async collectSneaker(request, response) {
      const result = await gameService.collectSneaker(request.player.id, request.body);
      response.json({ data: result });
    },

    async finish(request, response) {
      const state = await gameService.finishSession(request.player.id);
      response.json({ data: state });
    },

    async logActivity(request, response) {
      const result = await gameService.logActivity(request.player.id, request.body);
      response.status(201).json({ data: result });
    },
  };
}
