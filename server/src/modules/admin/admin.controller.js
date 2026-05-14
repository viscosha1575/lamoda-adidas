export function createAdminController({ adminService }) {
  return {
    async authMe(_request, response) {
      response.json(await adminService.getAuthMe());
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

    async deletePlayer(request, response) {
      response.json(await adminService.deletePlayer(request.body));
    },
  };
}
