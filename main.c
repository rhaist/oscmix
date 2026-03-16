#define _XOPEN_SOURCE 700  /* needed for SA_RESTART on FreeBSD */
#include <assert.h>
#include <errno.h>
#include <signal.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <fcntl.h>
#include <poll.h>
#include <sys/time.h>
#include <unistd.h>
#ifdef __linux__
#include <sys/ioctl.h>
#include <sound/asound.h>
#endif
#include "oscmix.h"
#include "arg.h"
#include "socket.h"
#include "util.h"

extern int dflag;
static int lflag;
static int rfd, wfd;
static volatile sig_atomic_t timeout;

static void
usage(void)
{
	fprintf(stderr, "usage: oscmix [-dlm] [-r addr] [-s addr]\n");
	exit(1);
}

#ifdef __linux__
static const char *const midi_devices[] = {"Fireface UCX II", NULL};
static char midiport[80];

static int
openmidi(void)
{
	int card, ctlfd, midifd, ver, i;
	char path[64];
	struct snd_ctl_card_info cardinfo;
	struct snd_rawmidi_info info;
	struct snd_rawmidi_params params;

	for (card = 0; card <= 31; ++card) {
		snprintf(path, sizeof path, "/dev/snd/controlC%d", card);
		ctlfd = open(path, O_RDONLY | O_CLOEXEC);
		if (ctlfd < 0)
			continue;
		if (ioctl(ctlfd, SNDRV_CTL_IOCTL_CARD_INFO, &cardinfo) != 0) {
			close(ctlfd);
			continue;
		}
		for (i = 0; midi_devices[i]; ++i) {
			if (strncmp((char *)cardinfo.name, midi_devices[i], strlen(midi_devices[i])) != 0)
				continue;
			if (ioctl(ctlfd, SNDRV_CTL_IOCTL_RAWMIDI_PREFER_SUBDEVICE, &(int){1}) != 0) {
				perror("ioctl SNDRV_CTL_IOCTL_RAWMIDI_PREFER_SUBDEVICE");
				close(ctlfd);
				return -1;
			}
			snprintf(path, sizeof path, "/dev/snd/midiC%dD0", card);
			midifd = open(path, O_RDWR | O_CLOEXEC);
			close(ctlfd);
			if (midifd < 0) {
				fprintf(stderr, "open %s: %s\n", path, strerror(errno));
				return -1;
			}
			if (ioctl(midifd, (int)SNDRV_RAWMIDI_IOCTL_PVERSION, &ver) != 0) {
				perror("ioctl SNDRV_RAWMIDI_IOCTL_PVERSION");
				close(midifd);
				return -1;
			}
			if (SNDRV_PROTOCOL_INCOMPATIBLE(ver, SNDRV_RAWMIDI_VERSION)) {
				fprintf(stderr, "incompatible rawmidi version\n");
				close(midifd);
				return -1;
			}
			info.stream = SNDRV_RAWMIDI_STREAM_INPUT;
			if (ioctl(midifd, (int)SNDRV_RAWMIDI_IOCTL_INFO, &info) != 0) {
				perror("ioctl SNDRV_RAWMIDI_IOCTL_INFO");
				close(midifd);
				return -1;
			}
			if (info.subdevice != 1) {
				fprintf(stderr, "could not open subdevice 1\n");
				close(midifd);
				return -1;
			}
			snprintf(midiport, sizeof midiport, "%s", (char *)info.subname);

			memset(&params, 0, sizeof params);
			params.stream = SNDRV_RAWMIDI_STREAM_INPUT;
			params.buffer_size = 8192;
			params.avail_min = 1;
			params.no_active_sensing = 1;
			if (ioctl(midifd, (int)SNDRV_RAWMIDI_IOCTL_PARAMS, &params) != 0) {
				perror("ioctl SNDRV_RAWMIDI_IOCTL_PARAMS");
				close(midifd);
				return -1;
			}
			params.stream = SNDRV_RAWMIDI_STREAM_OUTPUT;
			if (ioctl(midifd, (int)SNDRV_RAWMIDI_IOCTL_PARAMS, &params) != 0) {
				perror("ioctl SNDRV_RAWMIDI_IOCTL_PARAMS");
				close(midifd);
				return -1;
			}
			if (dup2(midifd, 6) < 0 || dup2(midifd, 7) < 0) {
				perror("dup2");
				close(midifd);
				return -1;
			}
			close(midifd);
			return 0;
		}
		close(ctlfd);
	}
	fprintf(stderr, "oscmix: no supported device found\n");
	return -1;
}
#endif

static void
midiread(int fd)
{
	static unsigned char data[8192], *dataend = data;
	unsigned char *datapos, *nextpos;
	uint_least32_t payload[sizeof data / 4];
	ssize_t ret;

	ret = read(fd, dataend, (data + sizeof data) - dataend);
	if (ret < 0)
		fatal("read %d:", fd);
	dataend += ret;
	datapos = data;
	for (;;) {
		assert(datapos <= dataend);
		datapos = memchr(datapos, 0xf0, dataend - datapos);
		if (!datapos) {
			dataend = data;
			break;
		}
		nextpos = memchr(datapos + 1, 0xf7, dataend - datapos - 1);
		if (!nextpos) {
			if (dataend == data + sizeof data) {
				fprintf(stderr, "sysex packet too large; dropping\n");
				dataend = data;
			} else {
				memmove(data, datapos, dataend - datapos);
				dataend -= datapos - data;
			}
			break;
		}
		++nextpos;
		handlesysex(datapos, nextpos - datapos, payload);
		datapos = nextpos;
	}
}

static void
oscread(int fd)
{
	unsigned char buf[8192];
	ssize_t ret;

	ret = read(fd, buf, sizeof buf);
	if (ret < 0) {
		perror("recv");
		return;
	}
	handleosc(buf, ret);
}

void
writemidi(const void *buf, size_t len)
{
	const unsigned char *pos;
	ssize_t ret;

	pos = buf;
	while (len > 0) {
		ret = write(7, pos, len);
		if (ret < 0)
			fatal("write 7:");
		pos += ret;
		len -= ret;
	}
}

void
writeosc(const void *buf, size_t len)
{
	ssize_t ret;

	ret = write(wfd, buf, len);
	if (ret < 0) {
		if (errno != ECONNREFUSED)
			perror("write");
	} else if (ret != len) {
		fprintf(stderr, "write: %zd != %zu", ret, len);
	}
}

static void
sighandler(int sig)
{
	timeout = 1;
}

int
main(int argc, char *argv[])
{
	static char defrecvaddr[] = "udp!127.0.0.1!7222";
	static char defsendaddr[] = "udp!127.0.0.1!8222";
	static char mcastaddr[] = "udp!224.0.0.1!8222";
	static const unsigned char refreshosc[] = "/refresh\0\0\0\0,\0\0\0";
	char *recvaddr, *sendaddr;
	struct itimerval it;
	struct sigaction sa;
	struct pollfd pfd[2];
	const char *port;

	recvaddr = defrecvaddr;
	sendaddr = defsendaddr;
	port = NULL;

	ARGBEGIN {
	case 'd':
		dflag = 1;
		break;
	case 'l':
		lflag = 1;
		break;
	case 'r':
		recvaddr = EARGF(usage());
		break;
	case 's':
		sendaddr = EARGF(usage());
		break;
	case 'm':
		sendaddr = mcastaddr;
		break;
	case 'p':
		port = EARGF(usage());
		break;
	default:
		usage();
		break;
	} ARGEND

	if (fcntl(6, F_GETFD) < 0) {
#ifdef __linux__
		if (openmidi() != 0)
			return 1;
		if (!port)
			port = midiport;
#else
		fatal("fcntl 6:");
#endif
	} else if (fcntl(7, F_GETFD) < 0) {
		fatal("fcntl 7:");
	}

	rfd = sockopen(recvaddr, 1);
	wfd = sockopen(sendaddr, 0);

	if (!port) {
		port = getenv("MIDIPORT");
		if (!port)
			fatal("device is not specified; pass -p or set MIDIPORT");
	}
	if (init(port) != 0)
		return 1;

	memset(&sa, 0, sizeof sa);
	sa.sa_handler = sighandler;
	sa.sa_flags = SA_RESTART;
	if (sigaction(SIGALRM, &sa, NULL) != 0)
		fatal("sigaction:");
	it.it_interval.tv_sec = 0;
	it.it_interval.tv_usec = 100000;
	it.it_value = it.it_interval;
	if (setitimer(ITIMER_REAL, &it, NULL) != 0)
		fatal("setitimer:");

	pfd[0].fd = 6;
	pfd[0].events = POLLIN;
	pfd[1].fd = rfd;
	pfd[1].events = POLLIN;
	handleosc(refreshosc, sizeof refreshosc - 1);
	for (;;) {
		if (poll(pfd, 2, -1) < 0 && errno != EINTR)
			fatal("poll:");
		if (pfd[0].revents & POLLIN)
			midiread(6);
		if (pfd[1].revents & POLLIN)
			oscread(rfd);
		if (timeout) {
			timeout = 0;
			handletimer(lflag == 0);
		}
	}
}
