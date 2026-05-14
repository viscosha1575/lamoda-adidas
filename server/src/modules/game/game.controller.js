export function createGameController({ gameService }) {
  return {
    async checkSubscription(request, response) {
      const result = await gameService.checkSubscription(request.player);
      response.json({ data: result });
    },

    async getState(request, response) {
      const state = await gameService.getState(request.player.id);
      response.json({ data: state });
    },

    async startSession(request, response) {
      const state = await gameService.startSession(request.player.id, request.body);
      response.status(201).json({ data: state });
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
