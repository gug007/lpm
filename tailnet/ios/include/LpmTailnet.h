#ifndef LPM_TAILNET_H
#define LPM_TAILNET_H

/* lpm Link's built-in Tailscale node (tailnet/ios). Every returned string is
   malloc'd: release it with LpmTailnetFree. A NULL error means success. */

char *LpmTailnetStart(const char *dir, const char *hostname);
void LpmTailnetStop(void);
char *LpmTailnetRestart(const char *dir, const char *hostname);
char *LpmTailnetLogin(void);
char *LpmTailnetLogout(void);
char *LpmTailnetWaitStatus(unsigned long long since, int timeoutMs);
int LpmTailnetBridge(const char *host, int port);
void LpmTailnetFree(char *p);

#endif
