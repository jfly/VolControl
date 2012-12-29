// VolCunt.cpp : Defines the entry point for the console application.
//

#include "stdafx.h"

#include <string>
#include <sstream>
#include <iostream>

#include <stdio.h>
#include <windows.h>
#include <mmdeviceapi.h>
#include <endpointvolume.h>

using namespace std;

int _tmain(int argc, _TCHAR* argv[])
{
	double newVolume = -1;
	bool changeMute = false;
	bool newMute = false;
	if(argc > 1) {
		if(wstring(L"-h") == argv[1]) {
			wcout << argv[0] << " mute to mute" << endl;
			wcout << argv[0] << " unmute to mute" << endl;
			wcout << argv[0] << " .43 to set volume" << endl;
			wcout << argv[0] << " to read settings" << endl;
			exit(0);
		} else if(wstring(L"mute") == argv[1]) {
			changeMute = true;
			newMute = true;
		} else if(wstring(L"unmute") == argv[1]) {
			changeMute = true;
			newMute = false;
		} else {
			wstringstream ss(argv[1]);
			ss >> newVolume;
		}
	}

	CoInitialize(NULL);
	IMMDeviceEnumerator *deviceEnumerator = NULL;
	HRESULT hr = CoCreateInstance(__uuidof(MMDeviceEnumerator), NULL, CLSCTX_INPROC_SERVER, __uuidof(IMMDeviceEnumerator), (LPVOID *)&deviceEnumerator);
	IMMDevice *defaultDevice = NULL;

	hr = deviceEnumerator->GetDefaultAudioEndpoint(eRender, eConsole, &defaultDevice);
	deviceEnumerator->Release();
	deviceEnumerator = NULL;

	IAudioEndpointVolume *endpointVolume = NULL;
	hr = defaultDevice->Activate(__uuidof(IAudioEndpointVolume), CLSCTX_INPROC_SERVER, NULL, (LPVOID *)&endpointVolume);
	defaultDevice->Release();
	defaultDevice = NULL; 

	float currentVolume = 0;

	endpointVolume->GetMasterVolumeLevelScalar(&currentVolume);
	printf("%f", currentVolume);

	BOOL muted;
	endpointVolume->GetMute(&muted);
	if(muted) {
		printf(" muted");
	}
	printf("\n");
    fflush(stdout);

	if(newVolume != -1) {
		endpointVolume->SetMasterVolumeLevelScalar((float) newVolume, NULL);
	}
	if(changeMute) {
		endpointVolume->SetMute(newMute, NULL);
	}

	endpointVolume->Release();

	CoUninitialize();
	return 0;
}

