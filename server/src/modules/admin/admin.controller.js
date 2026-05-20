export function createAdminController({ adminService }) {
  return {
    async authMe(request, response) {
      response.json(await adminService.getAuthMe(request.admin));
    },

    async analyticsOverview(request, response) {
      response.json(await adminService.getAnalyticsOverview(request.body));
    },

    async analyticsPlayers(request, response) {
      response.json(await adminService.getPlayers(request.body));
    },

    async analyticsPlayer(request, response) {
      response.json(await adminService.getPlayer(request.body));
    },

    async playerLogs(request, response) {
      response.json(await adminService.getPlayerLogs(request.body));
    },

    async analyticsUtm(request, response) {
      response.json(await adminService.getUtmSummary(request.body));
    },

    async promoCodes(request, response) {
      response.json(await adminService.getPromoCodes(request.body));
    },

    async createPromoCode(request, response) {
      response.json(await adminService.createPromoCode(request.body));
    },

    async deleteAllPromoCodes(_request, response) {
      response.json(await adminService.deleteAllPromoCodes());
    },

    async rafflePlayers(request, response) {
      response.json(await adminService.getRafflePlayers(request.body));
    },

    async raffleWinner(request, response) {
      response.json(await adminService.markRaffleWinner(request.body));
    },

    async finishRaffle(_request, response) {
      response.json(await adminService.finishRaffle());
    },

    async resetRaffleWinners(_request, response) {
      response.json(await adminService.resetRaffleWinners());
    },

    async deletePlayer(request, response) {
      response.json(await adminService.deletePlayer(request.body));
    },
  };
}
