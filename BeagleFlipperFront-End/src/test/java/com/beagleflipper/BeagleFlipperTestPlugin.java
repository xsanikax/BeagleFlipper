package com.beagleflipper;

import com.beagleflipper.controller.ApiRequestHandler;
import com.beagleflipper.controller.DoesNothingExecutorService;
import com.beagleflipper.controller.BeagleFlipperPlugin;
import com.beagleflipper.model.FlipManager; // Ensure FlipManager is imported
import com.beagleflipper.model.OsrsLoginManager; // Ensure OsrsLoginManager is imported
import net.runelite.client.RuneLite;
import net.runelite.client.externalplugins.ExternalPluginManager;
import okhttp3.OkHttpClient;
import org.mockito.Mockito; // Import Mockito

import java.util.concurrent.ScheduledExecutorService; // Import ScheduledExecutorService

public class BeagleFlipperTestPlugin
{
	public static void main(String[] args) throws Exception
	{
		// This main method is typically for basic plugin loading tests, not full unit tests.
		// If you intend to run this as a true unit test for FlipManager, you would need
		// to set up more sophisticated mocks for ApiRequestHandler, etc.
		// For now, providing dummy implementations for constructor.

		// Mock/Dummy dependencies for FlipManager constructor
		// You'll need to add 'testImplementation 'org.mockito:mockito-core:X.Y.Z'' to build.gradle for Mockito.mock()
		ApiRequestHandler mockApiRequestHandler = Mockito.mock(ApiRequestHandler.class);
		ScheduledExecutorService mockExecutorService = new DoesNothingExecutorService();
		OkHttpClient mockOkHttpClient = new OkHttpClient.Builder().build();
		OsrsLoginManager mockOsrsLoginManager = Mockito.mock(OsrsLoginManager.class);

		// Example instantiation of FlipManager with all required dependencies
		// This specific line might not be directly called in the main() method for runelite tests,
		// but demonstrates the correct constructor usage.
		FlipManager flipManager = new FlipManager(
				mockApiRequestHandler,
				mockExecutorService,
				mockOkHttpClient,
				mockOsrsLoginManager
		);


		ExternalPluginManager.loadBuiltin(BeagleFlipperPlugin.class);
		RuneLite.main(args);
	}
}
