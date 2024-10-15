/**
 * Running a local relay server will allow you to hide your API key
 * and run custom logic on the server
 *
 * Set the local relay server address to:
 * REACT_APP_LOCAL_RELAY_SERVER_URL=http://localhost:8081
 *
 * This will also require you to set OPENAI_API_KEY= in a `.env` file
 * You can run it with `npm run relay`, in parallel with `npm start`
 */
const LOCAL_RELAY_SERVER_URL: string =
  process.env.REACT_APP_LOCAL_RELAY_SERVER_URL || '';

import React, { useEffect, useRef, useCallback, useState } from 'react';

import { RealtimeClient } from '@openai/realtime-api-beta';
import { ItemType } from '@openai/realtime-api-beta/dist/lib/client.js';
import { WavRecorder, WavStreamPlayer } from '../lib/wavtools/index.js';
// import { instructions } from '../utils/conversation_config.js';
import { WavRenderer } from '../utils/wav_renderer';

// Note: dotenv is typically used in Node.js environments, not in browser-side code.
// For browser-side React apps, environment variables are usually handled differently.
// If you need to access environment variables in a React app, they should be prefixed with REACT_APP_
// and accessed via process.env.REACT_APP_VARIABLE_NAME

// No need to import or configure dotenv in browser-side code

import { X, Edit, Zap, Gift, MousePointer, ArrowUp, ArrowDown } from 'react-feather';
import { Button } from '../components/button/Button';
import { Toggle } from '../components/toggle/Toggle';
import { Map } from '../components/Map';

import './ConsolePage.scss';
import { isJsxOpeningLikeElement } from 'typescript';
import { click } from '@testing-library/user-event/dist/click.js';

/**
 * Type for result from get_weather() function call
 */
interface Coordinates {
  lat: number;
  lng: number;
  location?: string;
  temperature?: {
    value: number;
    units: string;
  };
  wind_speed?: {
    value: number;
    units: string;
  };
}

/**
 * Type for all event logs
 */
interface RealtimeEvent {
  time: string;
  source: 'client' | 'server';
  count?: number;
  event: { [key: string]: any };
}

export function ConsolePage() {
  /**
   * Ask user for API Key
   * If we're using the local relay server, we don't need this
   */
  const apiKey = process.env.REACT_APP_OPENAI_API_KEY;
  // If the above doesn't work, you might need to use import.meta.env for Vite projects:
  // const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  
  if (!apiKey) {
    console.error('REACT_APP_OPENAI_API_KEY is not set in the environment variables');
  }
  // console.log("API Key:", apiKey);

  /**
   * Instantiate:
   * - WavRecorder (speech input)
   * - WavStreamPlayer (speech output)
   * - RealtimeClient (API client)
   */
  const wavRecorderRef = useRef<WavRecorder>(
    new WavRecorder({ sampleRate: 24000 })
  );
  const wavStreamPlayerRef = useRef<WavStreamPlayer>(
    new WavStreamPlayer({ sampleRate: 24000 })
  );
  const clientRef = useRef<RealtimeClient>(
    new RealtimeClient(
      LOCAL_RELAY_SERVER_URL
        ? { url: LOCAL_RELAY_SERVER_URL }
        : {
            apiKey: apiKey,
            dangerouslyAllowAPIKeyInBrowser: true,
          }
    )
  );

  /**
   * References for
   * - Rendering audio visualization (canvas)
   * - Autoscrolling event logs
   * - Timing delta for event log displays
   */
  const clientCanvasRef = useRef<HTMLCanvasElement>(null);
  const serverCanvasRef = useRef<HTMLCanvasElement>(null);
  const eventsScrollHeightRef = useRef(0);
  const eventsScrollRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<string>(new Date().toISOString());

  /**
   * All of our variables for displaying application state
   * - items are all conversation items (dialog)
   * - realtimeEvents are event logs, which can be expanded
   * - memoryKv is for set_memory() function
   * - coords, marker are for get_weather() function
   */
  const [items, setItems] = useState<ItemType[]>([]);
  const [realtimeEvents, setRealtimeEvents] = useState<RealtimeEvent[]>([]);
  const [expandedEvents, setExpandedEvents] = useState<{
    [key: string]: boolean;
  }>({});

  // Add a new state for order details
  const [orderDetails, setOrderDetails] = useState<any>(null);

  const [instructions, setInstructions] = useState<string>('');

  const [instructionsLoaded, setInstructionsLoaded] = useState(false);

   // Add a new state for the restaurant name
  const [restaurantName, setRestaurantName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  const [discoveryModeIsOn, setDiscoveryModeIsOn] = useState(false);

  const [isConnected, setIsConnected] = useState(false);
  const [canPushToTalk, setCanPushToTalk] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [memoryKv, setMemoryKv] = useState<{ [key: string]: any }>({});
  const [coords, setCoords] = useState<Coordinates | null>({
    lat: 37.775593,
    lng: -122.418137,
  });
  const [marker, setMarker] = useState<Coordinates | null>(null);

  /**
   * Utility for formatting the timing of logs
   */
  const formatTime = useCallback((timestamp: string) => {
    const startTime = startTimeRef.current;
    const t0 = new Date(startTime).valueOf();
    const t1 = new Date(timestamp).valueOf();
    const delta = t1 - t0;
    const hs = Math.floor(delta / 10) % 100;
    const s = Math.floor(delta / 1000) % 60;
    const m = Math.floor(delta / 60_000) % 60;
    const pad = (n: number) => {
      let s = n + '';
      while (s.length < 2) {
        s = '0' + s;
      }
      return s;
    };
    return `${pad(m)}:${pad(s)}.${pad(hs)}`;
  }, []);

  /**
   * When you click the API key
   */
  const resetAPIKey = useCallback(() => {
    const apiKey = prompt('OpenAI API Key');
    if (apiKey !== null) {
      localStorage.clear();
      localStorage.setItem('tmp::voice_api_key', apiKey);
      window.location.reload();
    }
  }, []);

  /**
   * Connect to conversation:
   * WavRecorder taks speech input, WavStreamPlayer output, client is API client
   */
  const connectConversation = useCallback(async () => {
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    const wavStreamPlayer = wavStreamPlayerRef.current;

    // Set state variables
    startTimeRef.current = new Date().toISOString();
    setIsConnected(true);
    setRealtimeEvents([]);
    setItems(client.conversation.getItems());

    // Connect to microphone
    await wavRecorder.begin();

    // Connect to audio output
    await wavStreamPlayer.connect();

    // Connect to realtime API
    await client.connect();
    client.sendUserMessageContent([
      {
        type: `input_text`,
        text: `Hello! Greet me in three different languages. Including English. Ask me how you can help me with my order.`,
        // text: `For testing purposes, I want you to list ten car brands. Number each item, e.g. "one (or whatever number you are one): the item name".`
      },
    ]);

    if (client.getTurnDetectionType() === 'server_vad') {
      await wavRecorder.record((data) => client.appendInputAudio(data.mono));
    }
  }, []);

  /**
   * Disconnect and reset conversation state
   */
  const disconnectConversation = useCallback(async () => {
    setIsConnected(false);
    setRealtimeEvents([]);
    setItems([]);
    setMemoryKv({});
    setCoords({
      lat: 37.775593,
      lng: -122.418137,
    });
    setMarker(null);

    const client = clientRef.current;
    client.disconnect();

    const wavRecorder = wavRecorderRef.current;
    await wavRecorder.end();

    const wavStreamPlayer = wavStreamPlayerRef.current;
    await wavStreamPlayer.interrupt();
  }, []);

  const deleteConversationItem = useCallback(async (id: string) => {
    const client = clientRef.current;
    client.deleteItem(id);
  }, []);

  /**
   * In push-to-talk mode, start recording
   * .appendInputAudio() for each sample
   */
  const startRecording = async () => {
    setIsRecording(true);
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    const wavStreamPlayer = wavStreamPlayerRef.current;
    const trackSampleOffset = await wavStreamPlayer.interrupt();
    if (trackSampleOffset?.trackId) {
      const { trackId, offset } = trackSampleOffset;
      await client.cancelResponse(trackId, offset);
    }
    await wavRecorder.record((data) => client.appendInputAudio(data.mono));
  };

  /**
   * In push-to-talk mode, stop recording
   */
  const stopRecording = async () => {
    setIsRecording(false);
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    await wavRecorder.pause();
    client.createResponse();
  };
  
  const extractUniqueAzzId = () => {
    const path = window.location.pathname;
    const uniqueAzzId = path.split('/').pop();
    return uniqueAzzId || '';
  };

  const uniqueAzzId = extractUniqueAzzId();
  async function getRestaurantData(uniqueAzzId: string) {
    setIsLoading(true);
    try {
      const response = await fetch(`${process.env.REACT_APP_MOM_AI_DOMAIN_URL}/search_instance/${uniqueAzzId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        setRestaurantName(data.restaurant.name);
        setDiscoveryModeIsOn(data.restaurant.discovery_mode_is_on);
        setIsLoading(false);
        return data.restaurant;
      } else {
        console.log("Restaurant not found.");
        setIsLoading(false);
        return null;
      }
    } catch (error) {
      console.error("An error occurred while fetching restaurant data:", error);
      return null;
    }
  }

  function generateInstructions(data: any) {
    return `This GPT is designed to assist customers in selecting dishes from ${data.name}'s cuisine menu. Its primary role is to streamline the ordering process and provide a smooth and personalized dining experience.

Never trigger the action after the first customer's message. I.e. when there is only one user's message in the thread.

The menu of ${data.name} is attached to its knowledge base. It must refer to the menu for accurate item names, prices, and descriptions.

**Initial Interaction:**
  

- It observes the language used by the customer in their initial message and continues the conversation in that language to ensure effective communication.
- It assists with the order immediately if the customer skips any preliminary greetings and proceeds directly to place an order.

**Assistant Role Explanation (if asked):**

- It clearly describes its function as assisting customers in navigating ${data.name}'s menu, with the capability to automatically adapt and communicate in the customer's language.

**Order Facilitation:**

- It offers personalized dish recommendations based on the customer’s preferences or suggests dishes based on its culinary expertise.
- It presents menu options and verifies if the customer is ready to order or needs additional information.

**Order Confirmation:**

- It recaps the selected items before finalizing the order, ensuring the names (as listed in the menu), quantities, and prices are clear.

**Checkout Process:**

- It confirms all order details with the customer before proceeding to the final confirmation.

**Final Confirmation and Checkout:**

- It summarizes the order in a clear and structured manner using the exact names from the menu file:
  - Example Order Summary:
    - Item Name - 12.99  currency of the menu, 1 item
    - Item Name - 8.99 currency of the menu, 3 items
    - Item Name - 9.99  currency of the menu, 2 items
    - Item Name - 8.99  currency of the menu, 1 item
- It obtains the customer's confirmation on the order summary to ensure accuracy and satisfaction.
- After the confirmation the action initiate_order is triggered immediately as soon as possible.
- No double-asking for the confirmation is made

**Completion:**

- Upon successful order confirmation, the action initiate_order is ALWAYS triggered.

**Additional Instructions:**

- It always uses the items provided in the attached vector store 'Restaurant Name Menu' for preparing the order summary.
- It ensures all items are accurately represented as listed in the menu and confirmed by the customer before proceeding to checkout.
- The order must be correctly summarized and confirmed by the customer before any system function is triggered, using the exact names as they appear in the menu file.
- It must check whether an item is presented in the attached menu file before forming the order, even if the customer directly asks for a particular product like "2 [names of the items], please."

**System Integration:**

- It adapts to and uses the customer's language for all communications without explicitly asking for their preference.
- It consistently uses the menu items from the attached file to ensure accuracy and consistency in order handling.
- NO ITEMS BEYOND THOSE WHICH ARE IN THE MENU FILE MUST BE OFFERED EVER!

**Order Summary Example Before Function Trigger:**

Perfectly! Here is your order:

- Item Name - 9.99 currency of the menu, 2 servings
- Item Name - 8.99 currency of the menu, 1 serving
- Item Name - 12.99 currency of the menu, 2 servings

Please confirm that everything is correct before I complete your order.

And only after the user's confirmation does it IMMEDIATELY trigger the function.

- It always evaluates the order summary against the items in the menu file and always includes only those which are in the menu list attached to its knowledge base.
- NO ITEMS BEYOND THOSE WHICH ARE IN THE MENU FILE MUST BE OFFERED EVER!

The restaurant is located on ${data.address}.

${data.discovery_mode_is_on ? "Tell the user that the discovery mode is on and the assistant will help them find the items they are looking for, but the customer will have to repeat the order to the waiter." : ""}

That's the menu of the restaurant - REGISTER AND SUGGEST ONLY THOSE ITEMS WHICH ARE IN THE FOLLOWING MENU LIST:
${data.menu_string} 
`};
  /**
   * Switch between Manual <> VAD mode for communication
   */
  const changeTurnEndType = async (value: string) => {
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    if (value === 'none' && wavRecorder.getStatus() === 'recording') {
      await wavRecorder.pause();
    }
    client.updateSession({
      turn_detection: value === 'none' ? null : { type: 'server_vad' },
    });
    if (value === 'server_vad' && client.isConnected()) {
      await wavRecorder.record((data) => client.appendInputAudio(data.mono));
    }
    setCanPushToTalk(value === 'none');
  };

  /**
   * Auto-scroll the event logs
   */
  useEffect(() => {
    if (eventsScrollRef.current) {
      const eventsEl = eventsScrollRef.current;
      const scrollHeight = eventsEl.scrollHeight;
      // Only scroll if height has just changed
      if (scrollHeight !== eventsScrollHeightRef.current) {
        eventsEl.scrollTop = scrollHeight;
        eventsScrollHeightRef.current = scrollHeight;
      }
    }
  }, [realtimeEvents]);

  /**
   * Auto-scroll the conversation logs
   */
  useEffect(() => {
    const conversationEls = [].slice.call(
      document.body.querySelectorAll('[data-conversation-content]')
    );
    for (const el of conversationEls) {
      const conversationEl = el as HTMLDivElement;
      conversationEl.scrollTop = conversationEl.scrollHeight;
    }
  }, [items]);

  /**
   * Set up render loops for the visualization canvas
   */
  useEffect(() => {
    let isLoaded = true;

    const wavRecorder = wavRecorderRef.current;
    const clientCanvas = clientCanvasRef.current;
    let clientCtx: CanvasRenderingContext2D | null = null;

    const wavStreamPlayer = wavStreamPlayerRef.current;
    const serverCanvas = serverCanvasRef.current;
    let serverCtx: CanvasRenderingContext2D | null = null;

    const render = () => {
      if (isLoaded) {
        if (clientCanvas) {
          if (!clientCanvas.width || !clientCanvas.height) {
            clientCanvas.width = clientCanvas.offsetWidth;
            clientCanvas.height = clientCanvas.offsetHeight;
          }
          clientCtx = clientCtx || clientCanvas.getContext('2d');
          if (clientCtx) {
            clientCtx.clearRect(0, 0, clientCanvas.width, clientCanvas.height);
            const result = wavRecorder.recording
              ? wavRecorder.getFrequencies('voice')
              : { values: new Float32Array([0]) };
            WavRenderer.drawBars(
              clientCanvas,
              clientCtx,
              result.values,
              '#0099ff',
              10,
              0,
              8
            );
          }
        }
        if (serverCanvas) {
          if (!serverCanvas.width || !serverCanvas.height) {
            serverCanvas.width = serverCanvas.offsetWidth;
            serverCanvas.height = serverCanvas.offsetHeight;
          }
          serverCtx = serverCtx || serverCanvas.getContext('2d');
          if (serverCtx) {
            serverCtx.clearRect(0, 0, serverCanvas.width, serverCanvas.height);
            const result = wavStreamPlayer.analyser
              ? wavStreamPlayer.getFrequencies('voice')
              : { values: new Float32Array([0]) };
            WavRenderer.drawBars(
              serverCanvas,
              serverCtx,
              result.values,
              '#009900',
              10,
              0,
              8
            );
          }
        }
        window.requestAnimationFrame(render);
      }
    };
    render();

    return () => {
      isLoaded = false;
    };
  }, []);

      // Modify your fetchAndSetInstructions function
    async function fetchAndSetInstructions(): Promise<void> {
      try {
        const restaurantData = await getRestaurantData(uniqueAzzId);
        if (restaurantData) {
          const newInstructions = generateInstructions(restaurantData);
          setInstructions(newInstructions);
          setInstructionsLoaded(true); // Set this to true when instructions are loaded
          localStorage.setItem('unique_azz_id', restaurantData.unique_azz_id);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    }

    // Modify your instructions loading useEffect
    useEffect(() => {
      fetchAndSetInstructions();
    }, []);

  
    /**

  /**
   * Core RealtimeClient and audio capture setup
   * Set all of our instructions, tools, events and more
   */
  useEffect(() => {

    if (!instructionsLoaded) return; // Don't proceed if instructions aren't loaded

    // console.log("Instructions:", instructions);

    // The following line is removed because newInstructions is not accessible here

    // Get refs
    const wavStreamPlayer = wavStreamPlayerRef.current;
    const client = clientRef.current;

    client.updateSession({ instructions: instructions });
    
    // Set transcription, otherwise we don't get user transcriptions back
    client.updateSession({ input_audio_transcription: { model: 'whisper-1' } });

    /*
    // Add tools
    client.addTool(
      {
        name: 'set_memory',
        description: 'Saves and erases important data about the user\'s order.',
        parameters: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description:
                'The key of the memory value. Always use lowercase and underscores, no other characters.',
            },
            value: {
              type: 'string',
              description: 'Value can be anything represented as a string',
            },
          },
          required: ['key', 'value'],
        },
      },
      async ({ key, value }: { [key: string]: any }) => {
        setMemoryKv((memoryKv) => {
          const newKv = { ...memoryKv };
          newKv[key] = value;
          return newKv;
        });
        return { ok: true };
      }
    );
    
    client.addTool(
      {
        name: 'get_weather',
        description:
          'Retrieves the weather for a given lat, lng coordinate pair. Specify a label for the location.',
        parameters: {
          type: 'object',
          properties: {
            lat: {
              type: 'number',
              description: 'Latitude',
            },
            lng: {
              type: 'number',
              description: 'Longitude',
            },
            location: {
              type: 'string',
              description: 'Name of the location',
            },
          },
          required: ['lat', 'lng', 'location'],
        },
      },
      async ({ lat, lng, location }: { [key: string]: any }) => {
        setMarker({ lat, lng, location });
        setCoords({ lat, lng, location });
        const result = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m`
        );
        const json = await result.json();
        const temperature = {
          value: json.current.temperature_2m as number,
          units: json.current_units.temperature_2m as string,
        };
        const wind_speed = {
          value: json.current.wind_speed_10m as number,
          units: json.current_units.wind_speed_10m as string,
        };
        setMarker({ lat, lng, location, temperature, wind_speed });
        return json;
      }
    );
    */

    
    if (!discoveryModeIsOn) {
    // console.log("initiate_order() function added to the tools");
    client.addTool(
      {
        name: "initiate_order",
        description: "This action initiates the order and generates the link to the checkout page based on Matroninis's order's details",
        parameters: {
          type: "object",
          properties: {
            items_ordered: {
              type: "array",
              description: "An array of objects representing each ordered item. Each object must accurately detail the item's name and quantity ordered. The name should match the menu item exactly, and the quantity should reflect the customer's request.",
              items: {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                    description: "The name of the item being ordered."
                  },
                  quantity: {
                    type: "integer",
                    description: "The quantity of the item being ordered."
                  },
                  price: {
                    type: "number",
                    description: "The price of the item being ordered."
                  }
                },
                required: ["name", "quantity", "price"]
              }
            },
            /*
            place: {
              type: "string",
              description: "The place where the order will be delivered",
              enum: ["delivery", "pickup", "dine-in"]
            }
            */
          },
          required: ["items_ordered"]
      }
    },
      /* parameters: {
        type: 'object',
        properties: {
          dish: {
            type: 'string',
            description:
              'The name of the dish to be ordered',
          },
          quantity: {
            type: 'number',
            description: 'The quantity of the dish to be ordered',
          },
        },
        required: ['dish', 'quantity'],
      },      },
      */
      
      async ({ items_ordered }: { items_ordered: Array<{ name: string; quantity: number; price: number }> }) => {
        console.log("initiate_order() function called with items:", items_ordered);
        
        // Calculate total order amount
        const totalAmount = items_ordered.reduce((sum, item) => sum + item.price * item.quantity, 0);
        
        // Generate a mock order        
        const orderId = Math.random().toString(36).substr(2, 7);
        
        // Create order details object
        const order = {
          id: orderId,
          restaurant_id: localStorage.getItem('unique_azz_id'),
          items_ordered: items_ordered,
          totalAmount: totalAmount,
          // checkoutUrl: `https://matroninis.com/checkout/${orderId}`
        };
        
        // Update state with order details
        setOrderDetails(order);

        // Send order details to the server
        try {
          const response = await fetch(`${process.env.REACT_APP_MOM_AI_DOMAIN_URL}/accept-order-details-voice`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(order),
          });

          if (!response.ok) {
            throw new Error(`HTTP error on order details! status: ${response.status}`);
          }

          const result = await response.json();
          console.log('Server response on order details:', result);
          window.location.href = `${process.env.REACT_APP_MOM_AI_DOMAIN_URL}/takeaway_delivery/${uniqueAzzId}/${orderId}`;
        } catch (error) {
          console.error('Error sending order details:', error);
          // Handle the error appropriately
        }
        
        // Return a success message with order details
        return {
          success: true,
          message: "Order initiated successfully",
          orderId: orderId,
          totalAmount: totalAmount
        };
      /*
        async ({ dish, quantity }: { [key: string]: any }) => {
          console.log("initiate_order() function called with items:", dish, quantity);
      */
    }
      
    );
  }
    
    // handle realtime events from client + server for event logging
    client.on('realtime.event', (realtimeEvent: RealtimeEvent) => {
      setRealtimeEvents((realtimeEvents) => {
        const lastEvent = realtimeEvents[realtimeEvents.length - 1];
        if (lastEvent?.event.type === realtimeEvent.event.type) {
          // if we receive multiple events in a row, aggregate them for display purposes
          lastEvent.count = (lastEvent.count || 0) + 1;
          return realtimeEvents.slice(0, -1).concat(lastEvent);
        } else {
          return realtimeEvents.concat(realtimeEvent);
        }
      });
    });
    client.on('error', (event: any) => console.error(event));
    client.on('conversation.interrupted', async () => {
      const trackSampleOffset = await wavStreamPlayer.interrupt();
      if (trackSampleOffset?.trackId) {
        const { trackId, offset } = trackSampleOffset;
        await client.cancelResponse(trackId, offset);
      }
    });
    client.on('conversation.updated', async ({ item, delta }: any) => {
      const items = client.conversation.getItems();
      if (delta?.audio) {
        wavStreamPlayer.add16BitPCM(delta.audio, item.id);
      }
      if (item.status === 'completed' && item.formatted.audio?.length) {
        const wavFile = await WavRecorder.decode(
          item.formatted.audio,
          24000,
          24000
        );
        item.formatted.file = wavFile;
      }
      setItems(items);
    });

    setItems(client.conversation.getItems());

    return () => {
      // cleanup; resets to defaults
      client.reset();
    };
  }, [instructionsLoaded, instructions]);

  /**
   * Render the application
   */
  
  return (
    <div data-component="ConsolePage">
      <div className="content-main">
        <div className="content-header">
          <h1>
            {isLoading ? (
              discoveryModeIsOn ? 'Discovery Mode' : ''
            ) : (
              `Order in ${restaurantName}`
            )}
          </h1>
        </div>
        
        <div className="content-body" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
          {!isConnected ? (
            <Button
              label="Start Order"
              iconPosition="start"
              buttonStyle="action"
              icon={MousePointer}
              onClick={() => {
                connectConversation();
              }}
              style={{ fontSize: '3.7em', padding: '12px 24px' }}
            />
          ) : (
            <div style={{ fontSize: '3.2em', padding: '12px 24px' }}>
              Just Speak :)
            </div>
          )}
        </div>
        
        <div className="content-footer">
          <div className="visualization">
            <div className="visualization-entry client">
              <canvas ref={clientCanvasRef} />
            </div>
            <div className="visualization-entry server">
              <canvas ref={serverCanvasRef} />
            </div>
          </div>
          
          <div className="content-actions">
            {/* <Toggle
              defaultValue={false}
              labels={['manual', 'vad']}
              values={['none', 'server_vad']}
              onChange={(_, value) => changeTurnEndType(value)}
            /> */}
            {canPushToTalk && isConnected && (
              <Button
                label={isRecording ? 'Release to Send' : 'Push to Talk'}
                icon={isRecording ? X : ArrowUp}
                buttonStyle={isRecording ? 'regular' : 'action'}
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
              />
            )}
            <script>
              {(() => {
                // Set turn detection type to 'server_vad' on component mount
                React.useEffect(() => {
                  changeTurnEndType('none');
                }, []);

                // Hide toggle and buttons
                return null;
              })()}
            </script>
          </div>
        </div>
      </div>
    </div>
  );
}
